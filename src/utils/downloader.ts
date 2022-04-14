import * as fs from "fs"
import * as path from "path"
import { Context, Markup } from "telegraf";
import { Api } from "telegram";
import * as R from "ramda"
import { Download, PiState } from "../types";
import { findMediaMessage, getMediaMetadata, getMessage, getMessageMetadata, mkDownloadPath, mkMediaCategoryButtons, findCategory } from "./utils";
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
        const mediaDir = msgMetadata.orgMsgOriginName || "pi_media"
        const work = (tgMsg: Api.Message, categorySelectedMsg?: Message.TextMessage, identifier?: string) => {
          const mediaDownloader = async (category: string, timeout?: boolean) => {
            let shouldStartDownload = R.isNil(identifier)
            if (identifier) shouldStartDownload = state.pendingDownloads.delete(identifier)
            if (shouldStartDownload) {
              if (timeout) console.log("Media selection timed out", identifier)
              const filePath = mkDownloadPath(state.config, category, mediaDir, mediaMetadata.fileName)
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
        const mediaCategory = findCategory(state.config, mediaDir)
        if (state.config.enabledMediaCategories && R.isNil(mediaCategory)) {
          const identifier = uuid.v4()
          console.log("Adding media to pending downloads", identifier)
          const chooseCategoryMsg = await ctx.reply("Choose a category for this media.", {
            reply_markup: Markup.inlineKeyboard(mkMediaCategoryButtons(state.config.mediaCategories, identifier), { columns: 3 }).reply_markup,
            reply_to_message_id: msgId
          })
          state.pendingDownloads.set(identifier, work(tgMsg, chooseCategoryMsg, identifier))

        } else {
          await work(tgMsg)(mediaCategory ?? '')
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
    const download: Download = { name: fileName, percentage: 0, downloadedTillNow: 0, status: 'STARTING' }
    downloads.set(fileName, download)
    try {
      await msg.downloadMedia({
        progressCallback: (progress) => {
          if (fileSize) {
            const percentage = parseFloat(((progress / fileSize) * 100).toFixed(2))
            download.percentage = percentage
          }
          download.downloadedTillNow = progress
          download.status = 'DOWNLOADING'
        },
        outputFile: filePath
      })
      download.status = 'COMPLETED'
      console.log(`Download completed, file saved at path ${filePath}`, JSON.stringify(msg));
      ctx.reply("Download complete.", {
        reply_to_message_id: ctx.message?.message_id
      })
    } catch (error) {
      console.log("Exception occurred during download", error, JSON.stringify(msg))
      download.status = 'ERRORED'
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
