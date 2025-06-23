import { config } from "dotenv";
config();

import "./sentry.js";

import { getPostgres, initialize as initializeDatabase, ServerTagConfig, ServerTagHistory } from "./database.js";
import { loadContextMenus, loadMessageCommands, loadSlashCommands, synchronizeSlashCommands } from "./handlers/commands.js";

import { Client, GatewayDispatchEvents, IntentsBitField, TextChannel } from "discord.js";
import { loadTasks } from "./handlers/tasks.js";
export const client = new Client({
	intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.GuildMembers],
});

const { slashCommands, slashCommandsData } = await loadSlashCommands(client);
const { contextMenus, contextMenusData } = await loadContextMenus(client);
const messageCommands = loadMessageCommands(client);
loadTasks(client);

synchronizeSlashCommands(client, [...slashCommandsData, ...contextMenusData], {
	debug: true,
	guildId: process.env.GUILD_ID,
});

client.on("interactionCreate", async (interaction) => {
	if (interaction.isCommand()) {
		const isContext = interaction.isContextMenuCommand();
		if (isContext) {
			const run = contextMenus.get(interaction.commandName);
			if (!run) return;
			run(interaction, interaction.commandName);
		} else {
			const run = slashCommands.get(interaction.commandName);
			if (!run) return;
			run(interaction, interaction.commandName);
		}
	}
});

client.on("messageCreate", async (message) => {
	if (message.author.bot) return;

	if (!process.env.COMMAND_PREFIX) return;

	const args = message.content.slice(process.env.COMMAND_PREFIX.length).split(/ +/);
	const commandName = args.shift();

	if (!commandName) return;

	const run = (await messageCommands).get(commandName);

	if (!run) return;

	run(message, commandName);
});

client.on("ready", () => {
	console.log(`Logged in as ${client.user?.tag}. Ready to serve ${client.users.cache.size} users in ${client.guilds.cache.size} servers 🚀`);

	if (process.env.DB_NAME) {
		initializeDatabase().then(() => {
			console.log("Database initialized 📦");
		});
	} else {
		console.log("Database not initialized, as no keys were specified 📦");
	}

});

client.ws.on(GatewayDispatchEvents.GuildMemberUpdate, async (data) => {

	//	console.log(`User updated: ${data.user.id}`);
	//console.log(data)

	const lastUserHistory = await (await getPostgres).getRepository(ServerTagHistory).findOne({
		where: {
			userId: data.user.id,
		},
		order: {
			createdAt: "DESC",
		},
	});

	const userClan = data.user?.primary_guild;
	console.log(`User ${data.user.id} has clan: ${userClan ? userClan.tag : "No clan"}`);
	if (!userClan || !userClan.tag) {

		if (!lastUserHistory) return;
		if (lastUserHistory.toTag === "EMPTY_TAG") return;
		else {
			console.log(`User ${data.user.id} has no clan, but has a last tag history, setting to EMPTY_TAG`);
			await (await getPostgres).getRepository(ServerTagHistory).update({ userId: data.user.id }, {
				fromTag: lastUserHistory.toTag,
				toTag: "EMPTY_TAG",
			});
		}
	} else {
		if (lastUserHistory && lastUserHistory.toTag === userClan.tag) {
			console.log(`User ${data.user.id} has the same tag as last history, skipping`);
			return;
		}

		console.log(`User ${data.user.id} has a new tag: ${userClan.tag}`);
		await (await getPostgres).getRepository(ServerTagHistory).insert({
			serverId: data.guild_id,
			userId: data.user.id,
			fromTag: lastUserHistory ? lastUserHistory.toTag : "EMPTY_TAG",
			toTag: userClan.tag,
		});
		const shouldHavePerks = userClan.identity_guild_id == data.guild_id;
		console.log(`User ${data.user.id} should have perks: ${shouldHavePerks}`);

		const serverTagConfig = await (await getPostgres).getRepository(ServerTagConfig).findOne({
			where: {
				serverId: data.guild_id,
			},
		});

		if (!serverTagConfig) {
			console.log(`No server tag config found for server ${data.guild_id}`);
			return;
		}

		const rewardMessage = serverTagConfig.rewardMessage;
		const rewardChannelId = serverTagConfig.rewardChannelId;
		const rewardRoleId = serverTagConfig.rewardRoleId;

		if (rewardMessage && rewardChannelId && shouldHavePerks) {
			const channel = client.channels.cache.get(rewardChannelId) as TextChannel;
			if (channel && channel.isTextBased()) {
				channel.send(rewardMessage.replace("{user}", `<@${data.user.id}>`).replace("{tag}", userClan.tag));
			} else {
				console.log(`Reward channel ${rewardChannelId} not found or not a text channel.`);
			}
		}

		if (rewardRoleId) {
			const guild = client.guilds.cache.get(data.guild_id);
			if (!guild) {
				console.log(`Guild ${data.guild_id} not found.`);
				return;
			}
			const member = guild.members.cache.get(data.user.id);
			if (member) {
				if (member.roles.cache.has(rewardRoleId) && !shouldHavePerks) {
					console.log(`User ${data.user.id} already has role ${rewardRoleId}, removing it.`);
					member.roles.remove(rewardRoleId).catch((error) => {
						console.error(`Failed to remove role ${rewardRoleId} from user ${data.user.id}:`, error);
					});
					return;
				} else if (!member.roles.cache.has(rewardRoleId) && shouldHavePerks) {
					console.log(`User ${data.user.id} does not have role ${rewardRoleId}, adding it.`);
					member.roles.add(rewardRoleId).catch((error) => {
						console.error(`Failed to add role ${rewardRoleId} to user ${data.user.id}:`, error);
					});
				}
				console.log(`User ${data.user.id} has role ${rewardRoleId}: ${member.roles.cache.has(rewardRoleId)}`);
			} else {
				console.log(`User ${data.user.id} not found in guild ${data.guild_id}.`);
			}
		}
	}
});

client.login(process.env.DISCORD_CLIENT_TOKEN);
