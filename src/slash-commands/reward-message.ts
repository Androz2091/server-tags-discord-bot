import { ApplicationCommandOptionType, ChannelType, CommandInteractionOptionResolver, PermissionsBitField } from "discord.js";
import type { SlashCommandRunFunction } from "../handlers/commands.js";
import { errorEmbed, successEmbed } from "../util.js";
import { getPostgres, ServerTagConfig } from "../database.js";

export const commands = [
  {
    name: "reward-message",
    description: "Configure the reward message for the server (sent when someone sets your server tag)",
    options: [
      {
        name: "enable",
        description: "Enable or disable the reward message",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "message",
            description: "The message to send when someone sets your server tag",
            type: ApplicationCommandOptionType.String,
            maxLength: 2000,
            required: true,
          },
          {
            name: "channel",
            description: "The channel to send the message in",
            type: ApplicationCommandOptionType.Channel,
            channelTypes: [ChannelType.GuildText],
            required: true,
          }
        ],
      },
      {
        name: "disable",
        description: "Disable the reward message",
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },
];

export const run: SlashCommandRunFunction = async (interaction) => {

  if (!interaction.guildId) {
    return interaction.reply(errorEmbed("This command can only be used in a server."));
  }

  const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages);
  if (!isAdmin) {
    return interaction.reply(errorEmbed("You do not have permission to use this command. You need the `Manage Messages` permission."));
  }
  const options = interaction.options as CommandInteractionOptionResolver;
  const subcommand = options.getSubcommand(true);


  if (subcommand === "disable") {
    // Disable the reward message
    await (await getPostgres).getRepository(ServerTagConfig).update({ serverId: interaction.guildId }, {
      // @ts-ignore
      rewardMessage: null,
      // @ts-ignore
      rewardChannelId: null,
    });
    return interaction.reply(successEmbed("Reward message has been disabled!"));
  } else {

    const message = options.getString("message", true);
    const channel = options.getChannel("channel", true);
    if (channel.type !== ChannelType.GuildText) {
      return interaction.reply(errorEmbed("The channel must be a text channel."));
    }

    await (await getPostgres).getRepository(ServerTagConfig).upsert({
      serverId: interaction.guildId,
      rewardMessage: message,
      rewardChannelId: channel.id,
    }, ["serverId"]);
    return interaction.reply(successEmbed(`Reward message has been set to \`${message}\` and will be sent in <#${channel.id}>!`));

  }

};
