import { Api, TelegramClient } from "telegram";
import * as R from "ramda"
import { Document, Message, Video } from "telegraf/typings/core/types/typegram";
import mime from "mime-types"
import path from "path"
import fs from "fs"
import { Config } from "../config/config";

// Get original message using username and msg id
export const getMessage = async (client: TelegramClient, username: string, msgId: number) => {
  if (!R.isNil(client)) {
    console.log(`Fetching message ${msgId} from ${username}`);
    const messages = await client.getMessages(username, {
      ids: msgId
    })
    return messages.length > 0 ? messages[0] : null
  } else {
    return null
  }
}

// Get's metadata of a telegram media
export const getMediaMetadata = (media: Video | Document) => {
  let extension: string = ''
  if (media.mime_type) {
    let ext = mime.extension(media.mime_type)
    extension = typeof ext == "string" ? ext : ''
  }
  return {
    fileId: media.file_id,
    fileName: media.file_name || path.format({ name: media.file_id, ext: extension }),
    fileSize: media.file_size
  }
}

// Get's metadata of a telegram message
//TODO: Should it only be written assuming message is always forwarded?
export const getMessageMetadata = (message: Message.CommonMessage) => {
  // Message Id of message if forwarded then from original channel/user else bot
  let msgId = message.forward_from_message_id
  // Username of channel/user this media is residing in
  let msgUserName = R.path(["username"], message.forward_from_chat) as string | undefined || message.forward_from?.username || message.from?.username
  let msgOriginName = getMsgOriginName(message) || msgUserName

  return {
    orgMsgId: msgId,
    orgMsgUserName: msgUserName,
    orgMsgOriginName: msgOriginName
  }
}

// Get where message came from title if Channel / first + last name if User else username
const getMsgOriginName = (message: Message.CommonMessage) => {
  let senderName: string | undefined
  if (message.forward_from_chat) {
    senderName = R.path(["title"], message.forward_from_chat)
  }
  if (R.isNil(senderName) && message.forward_from) {
    senderName = message.forward_from.first_name + "_" + (message.forward_from.last_name || '')
  }
  if (R.isNil(senderName) && message.from) {
    senderName = message.from.first_name + "_" + (message.from.last_name || '')
  }
  return senderName
}

// Constructs download path for media, also creates the path in filesystem
export const mkDownloadPath = (config: Config, channelName: string, fileName: string) => {
  const downloadPath = path.join(config.downloadDir, channelName)
  if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true })
  return path.join(downloadPath, fileName)
}

export const findMediaMessage = async (client: TelegramClient, messageContent: string, userName: string, filter: Api.TypeMessagesFilter) => {
  const msgs = await client.getMessages(userName, {
    search: messageContent,
    filter: filter,
    limit: 1
  })
  return !R.isNil(msgs) && Array.isArray(msgs) ? msgs[0] : null
}
