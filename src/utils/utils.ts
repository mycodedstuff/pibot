import { TelegramClient } from "telegram";
import * as R from "ramda"

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
