import * as R from "ramda"
import { CodeInputMode } from "../types"
import path from "path"
import fs from "fs"

export const getConfig = (): Config => {
  const tgServerIP = process.env.TG_SERVER_IP
  const tgServerPort = process.env.TG_SERVER_PORT ? parseInt(process.env.TG_SERVER_PORT) : undefined
  const tgDCId = process.env.TG_DC_ID ? parseInt(process.env.TG_DC_ID) : undefined

  const phoneNumber = process.env.USER_PHONE_NUMBER
  const password = process.env.USER_PASSWORD

  const apiId = parseInt(process.env.TG_API_ID || '')
  const apiHash = process.env.TG_API_HASH

  const codeInputMode: CodeInputMode = getCodeInputMode()

  let codeServerPort = parseInt(process.env.CODE_SEVER_PORT || '9001')

  if (isNaN(codeServerPort)) codeServerPort = 9001

  const botToken = process.env.TG_BOT_TOKEN

  let downloadDir = process.env.DOWNLOAD_DIR

  const enabledMediaCategories = process.env.ENABLE_MEDIA_CATEGORIES || "false"

  const mediaCategories = ["Anime", "Movies", "Series", "Others"] //TODO: Add category wise path

  const categorySelectionTimeout = 15000

  const maxDownloadsInList = 5

  const whitelistedUsers = (process.env.WHITELISTED_USERS || '').split(',') // Username or userId

  const categoryMessageTime = 2000 //Time in milliseconds till which the msg will stay in chat

  // Guard for bot token
  if (R.isNil(botToken)) {
    console.error("Invalid bot token")
    process.exit(201)
  }

  if (R.isNil(phoneNumber) || R.isNil(password)) {
    console.error("Invalid client credentials")
    process.exit(202)
  }

  if (isNaN(apiId) || R.isNil(apiHash)) {
    console.error("Invalid telegram api credentials")
    process.exit(203)
  }
  try {
    if (downloadDir) {
      downloadDir = fs.realpathSync(downloadDir)
    } else {
      downloadDir = path.resolve("./downloads")
      if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir)
    }
  } catch (error) {
    console.error("Invalid download directory", downloadDir, error)
    process.exit(204)
  }

  return {
    ip: tgServerIP,
    port: tgServerPort,
    dcId: tgDCId,
    phoneNumber: phoneNumber,
    password: password,
    apiId: apiId,
    apiHash: apiHash,
    codeInputMode: codeInputMode,
    codeServerPort: codeServerPort,
    botToken: botToken,
    downloadDir: downloadDir,
    maxDownloadsInList: maxDownloadsInList,
    enabledMediaCategories: enabledMediaCategories.toLowerCase() === "true",
    mediaCategories: mediaCategories,
    categorySelectionTimeout: categorySelectionTimeout,
    whitelistedUsers: whitelistedUsers,
    categoryMessageTime: categoryMessageTime
  }
}

export type Config = {
  ip?: string,
  port?: number,
  dcId?: number,
  phoneNumber: string,
  password: string,
  apiId: number,
  apiHash: string,
  codeInputMode: CodeInputMode,
  codeServerPort: number,
  botToken: string,
  downloadDir: string,
  maxDownloadsInList: number,
  enabledMediaCategories: boolean
  mediaCategories: string[],
  categorySelectionTimeout: number,
  whitelistedUsers: string[],
  categoryMessageTime: number
}

const getCodeInputMode = (): CodeInputMode => {
  const mode = process.env.CODE_INPUT_MODE
  if (mode == "WEB") return "WEB"
  else return "CLI"
}
