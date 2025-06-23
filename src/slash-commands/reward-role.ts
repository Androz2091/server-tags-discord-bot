import { ApplicationCommandOptionType, ChannelType, CommandInteractionOptionResolver, PermissionsBitField } from "discord.js";
import type { SlashCommandRunFunction } from "../handlers/commands.js";
import { errorEmbed, successEmbed } from "../util.js";
import { getPostgres, ServerTagConfig } from "../database.js";

export const commands = [
  {
    name: "reward-role",
    description: "Configure the reward role for the server (sent when someone sets your server tag)",
    options: [
      {
        name: "enable",
        description: "Enable or disable the reward role",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "role",
            description: "The role to assign when someone sets your server tag",
            type: ApplicationCommandOptionType.Role,
            required: true,
          }
        ],
      },
      {
        name: "disable",
        description: "Disable the reward role",
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
    // Disable the reward role
    await (await getPostgres).getRepository(ServerTagConfig).upsert({
      // @ts-ignore
      rewardRoleId: null,
      serverId: interaction.guildId,
    }, ["serverId"]);
    return interaction.reply(successEmbed("Reward role has been disabled!"));
  } else {

    const role = options.getRole("role", true);

    await (await getPostgres).getRepository(ServerTagConfig).upsert({
      serverId: interaction.guildId,
      rewardRoleId: role.id,
    }, ["serverId"]);
    return interaction.reply(successEmbed(`Reward role has been set to <@&${role.id}>!`));
  }

};
