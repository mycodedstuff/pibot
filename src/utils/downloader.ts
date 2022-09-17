import * as fs from "fs"
import * as path from "path"
import { Context, Markup } from "telegraf";
import { Api } from "telegram";
import * as R from "ramda"
import { Download, PiState } from "../types";
import { getMediaMetadata, getMessage, mkDownloadPath, mkMediaCategoryButtons, findCategory, mkSeasonButtons, shouldAskForSeason, getMsgOriginName, parseSeasonNumber } from "./utils";
import { Message } from "telegraf/typings/core/types/typegram";
import * as uuid from "uuid"
import * as constants from "../config/constants"
import sanitize from "sanitize-filename";

type MessageDownloadFn = (tgMsg: Api.Message, categorySelectedMsg?: Message.TextMessage, identifier?: string) => (category: string, season?: number, timeout?: boolean) => Promise<void>

export const startMediaDownload = async (state: PiState, ctx: Context, message: Message.VideoMessage | Message.DocumentMessage, force: boolean = false) => {
  if (state.client.connected) {
    try {
      await downloadMediaFromMessage(state, ctx, message, force)
    } catch (error) {
      ctx.reply("Exception occurred while downloading this media", {
        reply_to_message_id: message.message_id
      })
      console.error("Exception occurred while downloading media", message.message_id, error);
    }
  } else {
    ctx.reply("Couldn't start downloading as client isn't connected.", {
      reply_to_message_id: message.message_id
    })
  }
}

// Proceed to find the message the bot received and start downloading the document/video
const downloadMediaFromMessage = async (state: PiState, ctx: Context, message: Message.VideoMessage | Message.DocumentMessage, force: boolean) => {
  if (!message.via_bot) {
    const msgId = message.message_id
    console.log("Fetching media via client", JSON.stringify(message));
    if (!R.isNil(message.forward_from_chat)) {
      const messages = await getMessage(state.client, message.forward_from_chat.id, {
        ids: [message.forward_from_message_id] as any as number[],
        limit: 1
      })
      let tgMsg = R.isNil(messages) ? null : messages[0]
      if (R.isNil(tgMsg)) {
        console.log("Couldn't find the msg with id", msgId, R.path(["title"], message.forward_from_chat));
        return void ctx.reply("Couldn't find the original message.", {
          reply_to_message_id: msgId
        })
      } else {
        console.log("Original Message => ", JSON.stringify(tgMsg));
      }
      const orgMsgOriginName = getMsgOriginName(message);
      const mediaMetadata = R.has("video", message) ? getMediaMetadata(message.video) : getMediaMetadata(message.document)
      const mediaDir = sanitize(orgMsgOriginName || "pi_media", { replacement: ' ' }).replace(/\s{2,}/, ' ')

      const work: MessageDownloadFn = (tgMsg: Api.Message, categorySelectedMsg?: Message.TextMessage, identifier?: string) => {
        const mediaDownloader = async (category: string, season?: number, timeout?: boolean) => {
          let shouldStartDownload = R.isNil(identifier)
          if (identifier) shouldStartDownload = state.pendingDownloads.delete(identifier)
          if (shouldStartDownload) {
            if (timeout) console.log("Media selection timed out", identifier)
            const filePath = mkDownloadPath(state.config, category, season, mediaDir, mediaMetadata.fileName)
            await downloadMedia(ctx, msgId, tgMsg, state.downloads, filePath, mediaMetadata.fileSize, force)
          }
        }
        if (identifier) {
          setTimeout((_: any) => {
            setTimeout((_: any) => {
              if (categorySelectedMsg && ctx.chat?.id)
                state.bot.telegram.deleteMessage(ctx.chat.id, categorySelectedMsg.message_id)
            }, state.config.categoryMessageTime)
            return mediaDownloader(constants.defaultMediaCategory, undefined, true)
          }, state.config.categorySelectionTimeout)
        }
        return mediaDownloader
      }

      const identifier = uuid.v4()
      const mediaCategory = findCategory(state.config, mediaDir)
      
      if (state.config.enabledMediaCategories) {
        if (R.isNil(mediaCategory)) {
          const chooseCategoryMsg = await askCategory(state, ctx, msgId, tgMsg, identifier, work)
          console.log("Adding media to pending downloads", identifier)
          state.pendingDownloads.set(identifier, work(tgMsg, chooseCategoryMsg, identifier))
        } else if (shouldAskForSeason(mediaCategory)) {
          const seasonNo = parseSeasonNumber(mediaMetadata.fileName)
          if (R.isNil(seasonNo)) {
            const askSeasonMsg = await askSeason(ctx, msgId, mediaCategory, identifier)
            console.log("Adding media to pending downloads", identifier)
            state.pendingDownloads.set(identifier, work(tgMsg, askSeasonMsg, identifier))
          } else {
            await work(tgMsg)(mediaCategory, seasonNo)
          }
        } else {
          await work(tgMsg)(mediaCategory ?? '')
        }
      } else {
        await work(tgMsg)(mediaCategory ?? '')
      }
    } else {
      console.log("Ignoring message sent via bot", JSON.stringify(message));
    }
  }
}

// Download media associated with a message
// This function will also publish the status within bot
const downloadMedia = async (ctx: Context, msgId: number, msg: Api.Message, downloads: Map<string, Download>, filePath: string, fileSize?: number, force: boolean = false) => {
  if (!fs.existsSync(filePath) || force) {
    console.log("Downloading media to path " + filePath, JSON.stringify(msg));
    ctx.reply("Downloading...", {
      reply_to_message_id: msgId
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
        reply_to_message_id: msgId
      })
    } catch (error) {
      console.log("Exception occurred during download", error, JSON.stringify(msg))
      download.status = 'ERRORED'
      ctx.reply("Couldn't download media.", {
        reply_to_message_id: msgId
      });
    }
  } else {
    ctx.reply("Media already downloaded.", {
      reply_to_message_id: msgId
    })
  }
}

const askCategory = (state: PiState, ctx: Context, msgId: number, tgMsg: Api.Message, identifier: string, work: MessageDownloadFn) => {
  return ctx.reply("Choose a category for this media.", {
    reply_markup: Markup.inlineKeyboard(mkMediaCategoryButtons(state.config.mediaCategories, identifier), { columns: 3 }).reply_markup,
    reply_to_message_id: msgId
  })
}

const askSeason = (ctx: Context, msgId: number, category: string, identifier: string) => {
  return ctx.reply(`Choose season for this media.`, {
    reply_markup: Markup.inlineKeyboard(mkSeasonButtons(category, identifier, 0, 8), { columns: 3 }).reply_markup, //TODO: Add support for more seasons
    reply_to_message_id: msgId
  })
}
