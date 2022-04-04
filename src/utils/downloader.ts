import * as fs from "fs"
import * as path from "path"
import { Context, Markup } from "telegraf";
import { Api } from "telegram";
import * as R from "ramda"
import * as database from "./database"
import { Download, PiState } from "../types";
import { findMediaMessage, getMediaMetadata, getMessage, getMessageMetadata, mkDownloadPath, mkMediaCategoryButtons } from "./utils";
import { Message } from "telegraf/typings/core/types/typegram";
import * as uuid from "uuid"
import * as constants from "../config/constants"

// Proceed to find the message the bot received and start downloading the document/video
export const downloadMediaFromMessage = async (state: PiState, ctx: Context, message: Message.VideoMessage | Message.DocumentMessage) => {
  if (!message.via_bot) {
    const msgId = message.message_id
    console.log("Fetching media via client", JSON.stringify(message));
    const msgMetadata = getMessageMetadata(message)
    if (!R.isNil(msgMetadata.orgMsgId) && !R.isNil(msgMetadata.orgMsgUserName)) {
      let tgMsg = await getMessage(state.client, msgMetadata.orgMsgUserName, msgMetadata.orgMsgId)
      if (R.isNil(tgMsg)) {
        if (message.caption && state.bot.botInfo?.username) {
          console.log("Using search method to find message", msgId);
          tgMsg = await findMediaMessage(state.client, message.caption, state.bot.botInfo.username, new Api.InputMessagesFilterVideo())
        }
      }
      if (!R.isNil(tgMsg)) {
        const mediaMetadata = R.has("video", message) ? getMediaMetadata(message.video) : getMediaMetadata(message.document)
        const work = (tgMsg: Api.Message, categorySelectedMsg?: Message.TextMessage, identifier?: string) => {
          const mediaDownloader = async (category: string, timeout?: boolean) => {
            let shouldStartDownload = R.isNil(identifier)
            if (identifier) shouldStartDownload = state.pendingDownloads.delete(identifier)
            if (shouldStartDownload) {
              if (timeout) console.log("Media selection timed out", identifier)
              const filePath = mkDownloadPath(state.config, category, msgMetadata.orgMsgOriginName || "pi_media", mediaMetadata.fileName)
              await downloadMedia(ctx, tgMsg, state.downloads, filePath, mediaMetadata.fileSize)
            }
          }
          if (identifier) {
            setTimeout(_ => {
              setTimeout(_ => {
                if (categorySelectedMsg && ctx.chat?.id)
                  state.bot.telegram.deleteMessage(ctx.chat.id, categorySelectedMsg.message_id)
              }, state.config.categoryMessageTime)
              return mediaDownloader(constants.defaultMediaCategory, true)
            }, state.config.categorySelectionTimeout)
          }
          return mediaDownloader
        }
        if (state.config.enabledMediaCategories) {
          const identifier = uuid.v4()
          console.log("Adding media to pending downloads", identifier)
          const chooseCategoryMsg = await ctx.reply("Choose a category for this media.", {
            reply_markup: Markup.inlineKeyboard(mkMediaCategoryButtons(state.config.mediaCategories, identifier), { columns: 3 }).reply_markup,
            reply_to_message_id: msgId
          })
          state.pendingDownloads.set(identifier, work(tgMsg, chooseCategoryMsg, identifier))

        } else {
          await work(tgMsg)('')
        }
      } else {
        console.log("Couldn't find the msg with id", msgMetadata.orgMsgId, msgMetadata.orgMsgUserName);
        ctx.reply("Couldn't find the original message.", {
          reply_to_message_id: msgId
        })
      }
    } else {
      console.log("Couldn't find msg details", msgId);
      ctx.reply("Couldn't find message details.", {
        reply_to_message_id: msgId
      })
    }
  } else {
    console.log("Ignoring message sent via bot", JSON.stringify(message));
  }
}

// Download media associated with a message
// This function will also publish the status within bot
const downloadMedia = async (ctx: Context, msg: Api.Message, downloads: Map<string, Download>, filePath: string, fileSize?: number) => {
  if (!fs.existsSync(filePath)) {
    console.log("Downloading media to path " + filePath, JSON.stringify(msg));
    ctx.reply("Downloading...", {
      reply_to_message_id: ctx.message?.message_id
    })
    const fileName = path.basename(filePath)
    downloads.set(fileName, { name: fileName, percentage: -1, downloadedTillNow: 0 })
    const buffer = await msg.downloadMedia({
      progressCallback: (progress) => {
        if (fileSize) {
          const percentage = parseInt(((progress / fileSize) * 100).toFixed(2))
          downloads.set(fileName, { name: fileName, percentage, downloadedTillNow: progress })
        } else {
          downloads.set(fileName, { name: fileName, downloadedTillNow: progress })
        }
      }
    })
    if (!R.isNil(buffer)) {
      fs.writeFileSync(filePath, buffer)
      ctx.reply("Download complete.", {
        reply_to_message_id: ctx.message?.message_id
      })
      console.log(`Download completed, file saved at path ${filePath}`, JSON.stringify(msg));
      database.instance.run(`insert into downloads values(${msg.id})`)
    } else {
      ctx.reply("Couldn't download media.", {
        reply_to_message_id: ctx.message?.message_id
      });
    }
  } else {
    ctx.reply("Media already downloaded.", {
      reply_to_message_id: ctx.message?.message_id
    })
  }
}

// Returns the chunk size in KB depending upon fileSize in bytes
// This method is picked from gramjs
const getAppropriatedPartSize = (fileSize: number) => {
  if (fileSize <= 104857600) {
    // 100MB
    return 128;
  }
  if (fileSize <= 786432000) {
    // 750MB
    return 256;
  }
  if (fileSize <= 2097152000) {
    // 2000MB
    return 512;
  }
  return 64
}
