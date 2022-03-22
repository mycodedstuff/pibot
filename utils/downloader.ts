import * as fs from "fs"
import * as path from "path"
import { Context } from "telegraf";
import { Api } from "telegram";
import * as R from "ramda"
import * as database from "./database"

// Download media associated with a message
// This function will also publish the status within bot
export const downloadMedia = async (ctx: Context, msg: Api.Message, downloads: Map<number, number>, filePath?: string) => {
  filePath = R.isNil(filePath) ? path.join(__dirname, "downloads", msg.id.toString()) : filePath
  if (!fs.existsSync(filePath)) {
    console.log("Downloading media", JSON.stringify(msg));
    ctx.reply("Downloading...", {
      reply_to_message_id: ctx.message?.message_id
    })
    const buffer = await msg.downloadMedia({
      workers: 2,
      progressCallback: (progress) => {
        downloads.set(msg.id, progress)
        console.log(msg.id, progress);
      }
    })
    if (!R.isNil(buffer)) {
      fs.writeFileSync(filePath, buffer)
      ctx.reply("Download complete.", {
        reply_to_message_id: ctx.message?.message_id
      })
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
