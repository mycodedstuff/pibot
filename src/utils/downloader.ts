import * as fs from "fs"
import * as path from "path"
import { Context } from "telegraf";
import { Api } from "telegram";
import * as R from "ramda"
import * as database from "./database"
import { Download, PiState } from "../types";
import { findMediaMessage, getMediaMetadata, getMessage, getMessageMetadata, mkDownloadPath } from "./utils";
import { Message } from "telegraf/typings/core/types/typegram";

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
        const filePath = mkDownloadPath(state.config, msgMetadata.orgMsgOriginName || "pi_media", mediaMetadata.fileName)
        await downloadMedia(ctx, tgMsg, state.downloads, filePath, mediaMetadata.fileSize)
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
    const chunkSize = fileSize ? getAppropriatedPartSize(fileSize) : undefined
    const fileSizeInKb = fileSize ? fileSize / 1024 : undefined
    const totalChunks = chunkSize && fileSizeInKb ? fileSizeInKb / chunkSize : undefined
    const fileName = path.basename(filePath)
    downloads.set(fileName, { name: fileName, percentage: -1, chunkNumber: 0 })
    const buffer = await msg.downloadMedia({
      workers: 2,
      progressCallback: (progress) => {
        if (totalChunks) {
          const percentage = parseInt(((progress / totalChunks) * 100).toFixed(0))
          downloads.set(fileName, { name: fileName, percentage, chunkNumber: progress })
        } else {
          downloads.set(fileName, { name: fileName, chunkNumber: progress })
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
