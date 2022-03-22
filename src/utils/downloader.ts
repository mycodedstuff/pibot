import * as fs from "fs"
import * as path from "path"
import { Context } from "telegraf";
import { Api } from "telegram";
import * as R from "ramda"
import * as database from "./database"
import { Download } from "../types";

// Download media associated with a message
// This function will also publish the status within bot
export const downloadMedia = async (ctx: Context, msg: Api.Message, downloads: Map<string, Download>, filePath?: string, fileSize?: number) => {
  filePath = R.isNil(filePath) ? path.join(__dirname, "downloads", msg.id.toString()) : filePath
  if (!fs.existsSync(filePath)) {
    console.log("Downloading media", JSON.stringify(msg));
    ctx.reply("Downloading...", {
      reply_to_message_id: ctx.message?.message_id
    })
    const chunkSize = fileSize ? getAppropriatedPartSize(fileSize) : undefined
    const fileSizeInKb = fileSize ? fileSize / 1024 : undefined
    const totalChunks = chunkSize && fileSizeInKb ? fileSizeInKb / chunkSize : undefined
    const fileName = path.basename(filePath)
    downloads.set(fileName, {name: fileName, percentage: -1})
    const buffer = await msg.downloadMedia({
      workers: 2,
      progressCallback: (progress) => {
        if (totalChunks) {
          const percentage = parseInt(((progress / totalChunks) * 100).toFixed(0))
          downloads.set(fileName, {name: fileName, percentage})
          console.log(fileName, msg.id, percentage)
        } else {
          console.log(fileName, msg.id, progress)
        }
      }
    })
    if (!R.isNil(buffer)) {
      fs.writeFileSync(filePath, buffer)
      ctx.reply("Download complete.", {
        reply_to_message_id: ctx.message?.message_id
      })
      console.log("Download completed", JSON.stringify(msg));
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
