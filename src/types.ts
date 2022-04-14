import { Telegraf } from "telegraf"
import { TelegramClient } from "telegram"
import { Config } from "./config/config"

// Represents an download
export type Download = {
  percentage?: number,
  name: string,
  downloadedTillNow: number,
  status: DownloadStatus
}

export type CodeInputMode = "CLI" | "WEB"

export type PendingDownload = (category: string) => Promise<void>

export type PiState = {
  config: Config,
  client: TelegramClient,
  bot: Telegraf,
  downloads: Map<string, Download>,
  pendingDownloads: Map<string, PendingDownload>
}

export type CallbackType = 'REFRESH_DOWNLOAD' | 'NAVIGATE_PAGE' | 'CATEGORY_SELECTED'

export type DownloadStatus = 'STARTING' | 'DOWNLOADING' | 'COMPLETED' | 'CANCELED' | 'ERRORED'
