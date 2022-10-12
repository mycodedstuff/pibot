import { Api, TelegramClient } from "telegram";
import * as R from "ramda"
import { Document, Message, ReplyMessage, Video } from "telegraf/typings/core/types/typegram";
import mime from "mime-types"
import path from "path"
import fs from "fs"
import { Config } from "../config/config";
import { CallbackType, Download, DownloadStatus, MessageFilter, PiState } from "../types";
import bytes from "bytes";
import { Markup } from "telegraf";
import * as constants from "../config/constants"
import sanitize from "sanitize-filename"
import { EntityLike } from "telegram/define";
import episodeParser from "episode-parser";

// Get original message using username and msg id
export const getMessage = async (client: TelegramClient, userId: EntityLike, filter: MessageFilter) => {
  if (!R.isNil(client) && client.connected) {
    console.log(`Fetching message ${filter.ids} from ${userId}`);
    const messages = await client.getMessages(userId, {
      ids: filter.ids,
      limit: filter.limit
    })
    return messages
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

// Get where message came from title if Channel / first + last name if User else username
export const getMsgOriginName = (message: Message.CommonMessage) => {
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
export const mkDownloadPath = (config: Config, category: string, season: number | undefined, channelName: string, fileName: string) => {
  const seasonDir = !R.isNil(season) ? (season === 0 ? 'Specials' : `Season ${season}`) : ''
  const downloadPath = path.normalize(path.join(config.downloadDir, category, sanitize(channelName, { replacement: ' ' }).replace(/\s{2,}/, ' '), seasonDir))
  if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true })
  return path.join(downloadPath, fileName)
}

export const constructDownloadList = (state: PiState, currentPageNo: number) => {
  let msg = "📥  Downloads\n\n"
  const nextDownloadList = R.take(state.config.maxDownloadsInList, R.drop(state.config.maxDownloadsInList * (currentPageNo - 1), Array.from(state.downloads.values())))
  for (const download of nextDownloadList) {
    const prefix = getSymbolForStatus(download.status)
    const progress = getProgressOfDownload(download)
    msg += `${prefix}  ${download.name} : ${progress}\n\n`
  }
  return msg
}

const getProgressOfDownload = (download: Download) => {
  if (download.status === "STARTING") {
    return "Starting"
  } else if (download.status === "COMPLETED") {
    return "Completed"
  } else if (download.status === "CANCELED") {
    return "Canceled"
  } else if (download.status === "ERRORED") {
    return "Errored"
  } else {
    if (download.percentage) {
      return `${download.percentage}%`
    }
    else {
      return `${bytes(download.downloadedTillNow)} downloaded`
    }
  }
}

const getSymbolForStatus = (status: DownloadStatus) => {
  switch (status) {
    case "STARTING":
      return "🔵"
    case "DOWNLOADING":
      return "🟠"
    case "COMPLETED":
      return "🟢"
    case "CANCELED":
      return "🔴"
    case "ERRORED":
      return "🔴"
  }
}

export const buttons = {
  refreshDownloadBtn: Markup.button.callback("Refresh", constants.refreshDownloads),
  paginatedBtn: (pageNo: number, current: number) => Markup.button.callback(pageNo == current ? "🔘" : pageNo.toString(), constants.pageNoPrefix + pageNo),
  previousPage: (previousPage: number) => Markup.button.callback("<<", constants.pageNoPrefix + previousPage),
  nextPage: (nextPage: number) => Markup.button.callback(">>", constants.pageNoPrefix + nextPage),
  category: (categoryName: string, identifier: string) => Markup.button.callback(categoryName, constants.categoryPrefix + categoryName + '_' + identifier),
  season: (number: number, identifier: string, category: string) => Markup.button.callback(number === 0 ? 'Specials' : `Season ${number}`, constants.seasonPrefix + number + '_' + category + '_' + identifier)
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
      return "REFRESH_DOWNLOAD"
    } else if (R.startsWith(constants.pageNoPrefix, callbackQuery)) {
      return "NAVIGATE_PAGE"
    } else if (R.startsWith(constants.categoryPrefix, callbackQuery)) {
      return "CATEGORY_SELECTED"
    } else if (R.startsWith(constants.seasonPrefix, callbackQuery)) {
      return "SEASON_SELECTED"
    }
  }
  return null
}

export const mkMediaCategoryButtons = (mediaCategories: string[], uuid: string) => {
  return mediaCategories.map(categoryName => {
    return buttons.category(categoryName, uuid)
  })
}

export const findCategory = (config: Config, dirName: string) => {
  for (let category of config.mediaCategories) {
    category = category === "Others" ? constants.defaultMediaCategory : category
    const dirPath = path.normalize(path.join(config.downloadDir, category, dirName))
    if (fs.existsSync(dirPath)) {
      return category
    }
  }
}

export const isMessageTypeMedia = (message: ReplyMessage | Message): message is Message.VideoMessage | Message.DocumentMessage => {
  if ("video" in message) return true
  if ("document" in message) return true
  return false
}

export const mkSeasonButtons = (category: string, identifier: string, start: number, step: number) => {
  const seasonButtons = []
  for (let num = start; num <= start + step; num++) {
    seasonButtons.push(buttons.season(num, identifier, category))
  }
  return seasonButtons
}

export const shouldAskForSeason = (category: string) => {
  return ["Anime", "Series"].indexOf(category) !== -1
}

export const parseSeasonNumber = (fileName: string) => {
  const mediaInfo = episodeParser(fileName)
  console.log(`Media info of ${fileName}`, JSON.stringify(mediaInfo));
  if (!R.isNil(mediaInfo)) {
    if (R.isNil(mediaInfo.episode) || fileName.indexOf(mediaInfo.season + '' + mediaInfo.episode) === -1) {
      return mediaInfo?.season
    }
  }
  return null
}
