import { Api, TelegramClient } from "telegram";
import * as R from "ramda"
import { Document, Message, Video } from "telegraf/typings/core/types/typegram";
import mime from "mime-types"
import path from "path"
import fs from "fs"
import { Config } from "../config/config";
import { CallbackType, PiState } from "../types";
import bytes from "bytes";
import { Markup } from "telegraf";
import * as constants from "../config/constants"
import sanitize from "sanitize-filename"

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
export const mkDownloadPath = (config: Config, category: string, channelName: string, fileName: string) => {
  const downloadPath = path.normalize(path.join(config.downloadDir, category, sanitize(channelName, { replacement: ' ' }).replace(/\s{2,}/, ' ')))
  if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true })
  return path.join(downloadPath, fileName)
}

// Search for a message within this given username channel
export const findMediaMessage = async (client: TelegramClient, messageContent: string, userName: string, filter: Api.TypeMessagesFilter) => {
  const msgs = await client.getMessages(userName, {
    search: messageContent,
    filter: filter,
    limit: 1
  })
  return !R.isNil(msgs) && Array.isArray(msgs) ? msgs[0] : null
}

export const constructDownloadList = (state: PiState, currentPageNo: number) => {
  let msg = "📥  Downloads\n\n"
  const nextDownloadList = R.take(state.config.maxDownloadsInList, R.drop(state.config.maxDownloadsInList * (currentPageNo - 1), Array.from(state.downloads.values())))
  for (const download of nextDownloadList) {
    if (download.percentage) {
      const progress = download.percentage == -1 ? "starting" : `${download.percentage}%`
      const prefix = download.percentage === 100 ? "🟢" : "🟠"
      msg += `${prefix}  ${download.name}\n   Progress: ${progress}\n\n`
    } else {
      msg += `${download.name} => ${bytes(download.downloadedTillNow)} downloaded\n\n`
    }
  }
  return msg
}

export const buttons = {
  refreshDownloadBtn: Markup.button.callback("Refresh", constants.refreshDownloads),
  paginatedBtn: (pageNo: number, current: number) => Markup.button.callback(pageNo == current ? "🔘" : pageNo.toString(), constants.pageNoPrefix + pageNo),
  previousPage: (previousPage: number) => Markup.button.callback("<<", constants.pageNoPrefix + previousPage),
  nextPage: (nextPage: number) => Markup.button.callback(">>", constants.pageNoPrefix + nextPage),
  category: (categoryName: string, identifier: string) => Markup.button.callback(categoryName, constants.categoryPrefix + categoryName + '_' + identifier)
}

export const constructPageButtons = (state: PiState, currentPage: number) => {
  const visiblePages = 5
  const totalPages = Math.ceil(state.downloads.size / state.config.maxDownloadsInList)
  const totalNumericPages = totalPages <= visiblePages ? visiblePages : visiblePages - 2
  const pageWindow = Math.floor((currentPage - 1) / totalNumericPages) + 1
  const totalPageWindows = Math.floor(totalPages / totalNumericPages) + 1
  const pageButtons = []
  let startPage = -1
  if (totalPages > 1) {
    if (pageWindow == 1) {
      startPage = 1
    } else if (pageWindow == totalPageWindows) {
      startPage = totalPages - totalNumericPages + 1
    } else {
      startPage = (pageWindow - 1) * totalNumericPages + 1
    }
    if (pageWindow <= 1) pageButtons.push(buttons.previousPage(startPage - 1))
    for (let pageNo = startPage; pageNo <= startPage + totalNumericPages - 1 && pageNo <= totalPages; pageNo++) {
      pageButtons.push(buttons.paginatedBtn(pageNo, currentPage))
    }
    if (startPage + totalNumericPages > totalPages) pageButtons.push(buttons.nextPage(startPage + totalNumericPages))
  }
  return pageButtons
}

export const getCallbackTypeFromQuery = (callbackQuery: string): CallbackType | null => {
  if (!R.isNil(callbackQuery)) {
    if (callbackQuery == constants.refreshDownloads) {
      return "REFRESH_DOwNLOAD"
    } else if (R.startsWith(constants.pageNoPrefix, callbackQuery)) {
      return "NAVIGATE_PAGE"
    } else if (R.startsWith(constants.categoryPrefix, callbackQuery)) {
      return "CATEGORY_SELECTED"
    } else if (R.startsWith(constants.selectCategoryPrefix, callbackQuery)) {
      return "SET_CATEGORY"
    }
  }
  return null
}

export const mkMediaCategoryButtons = (mediaCategories: string[], uuid: string) => {
  return mediaCategories.map(categoryName => {
    return buttons.category(categoryName, uuid)
  })
}
