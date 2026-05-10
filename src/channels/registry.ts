import {
  Channel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
} from '../types.js';

export interface ChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  /**
   * Called when a user adds a reaction to a message.
   * Optional — channels that don't support reactions can ignore it.
   * @param messageContent Full text of the reacted message
   * @param emoji          Emoji name (e.g. "🎧")
   * @param channelJid     JID of the channel where the reaction occurred
   */
  onReactionAdd?: (
    messageContent: string,
    emoji: string,
    channelJid: string,
  ) => Promise<void>;
}

export type ChannelFactory = (opts: ChannelOpts) => Channel | null;

const registry = new Map<string, ChannelFactory>();

export function registerChannel(name: string, factory: ChannelFactory): void {
  registry.set(name, factory);
}

export function getChannelFactory(name: string): ChannelFactory | undefined {
  return registry.get(name);
}

export function getRegisteredChannelNames(): string[] {
  return [...registry.keys()];
}
