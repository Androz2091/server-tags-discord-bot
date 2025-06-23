import { Database, Resource } from "@adminjs/typeorm";
import { validate } from "class-validator";
import { BaseEntity, Column, DataSource, Entity, PrimaryGeneratedColumn } from "typeorm";

import { join } from "node:path";
import AdminJSFastify from "@adminjs/fastify";
import fastifyStatic from "@fastify/static";
import AdminJS from "adminjs";
import fastify from "fastify";

Resource.validate = validate;
AdminJS.registerAdapter({ Database, Resource });

@Entity()
export class ServerTagConfig extends BaseEntity {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({
		unique: true,
	})
	serverId!: string;

	@Column({
		nullable: true,
	})
	rewardChannelId!: string;

	@Column({
		nullable: true,
	})
	rewardMessage!: string;

	@Column({
		nullable: true
	})
	rewardRoleId!: string;
}

@Entity()
export class ServerTagHistory extends BaseEntity {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column()
	serverId!: string;

	@Column()
	userId!: string;

	@Column()
	fromTag!: string;

	@Column()
	toTag!: string;

	@Column({
		type: "timestamp",
		default: () => "CURRENT_TIMESTAMP",
	})
	createdAt!: Date;
}

const entities = [ServerTagConfig, ServerTagHistory];

let resolveInitialize: (value: DataSource) => void;
export const getPostgres: Promise<DataSource> = new Promise((resolve) => {
	resolveInitialize = resolve;
});

export const initialize = () => {
	const Postgres = new DataSource({
		type: "postgres",
		host: process.env.DB_HOST,
		database: process.env.DB_NAME,
		username: process.env.DB_USERNAME,
		password: process.env.DB_PASSWORD,
		entities,
		synchronize: process.env.ENVIRONMENT === "development",
	})
	Postgres.initialize().then(async () => {
		resolveInitialize(Postgres);
		if (process.env.ADMINJS_PORT) {
			const app = fastify();
			const admin = new AdminJS({
				branding: {
					companyName: "Discord Bot",
				},
				resources: entities,
			});
			app.get("/", async (request, reply) => {
				return reply.redirect("/admin");
			});
			app.register(fastifyStatic, {
				root: join(import.meta.dirname, "../public"),
				prefix: "/public/",
			});
			await AdminJSFastify.buildAuthenticatedRouter(
				admin,
				{
					// biome-ignore lint: password is going to be filled
					cookiePassword: process.env.ADMINJS_COOKIE_HASH!,
					cookieName: "adminjs",
					authenticate: async (_email, password) => {
						if (_email) return false;
						// biome-ignore lint: password is going to be filled
						if (password === process.env.ADMINJS_PASSWORD!) {
							return true;
						}
					},
				},
				app,
			);
			app.listen(
				{
					host: "0.0.0.0",
					port: process.env.ADMINJS_PORT,
				},
				() => {
					console.log(`AdminJS is listening at http://localhost:${process.env.ADMINJS_PORT}`);
				},
			);
		}
	});
	return getPostgres;
}
