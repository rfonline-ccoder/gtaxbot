import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Client, Collection, GatewayIntentBits, ActivityType, ChannelType, PermissionsBitField } from 'discord.js';
import winston from 'winston';
import sendRestrictedMessage from './sendRestrictedMessage.mjs';
import { setupTicketMessage, handleTicketInteraction } from './ticketSupport.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(info => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`),
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' })
    ],
});

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent 
    ] 
});

client.commands = new Collection();

const commandFiles = fs.readdirSync(__dirname).filter(file => file.endsWith('.mjs') && file !== 'index.mjs' && file !== 'deploy-commands.mjs');

for (const file of commandFiles) {
    try {
        const filePath = pathToFileURL(path.join(__dirname, file)).href;
        const command = await import(filePath);
        client.commands.set(command.default.data.name, command.default);
        logger.info(`Команда ${file} успешно загружена.`);
    } catch (error) {
        logger.error(`Ошибка при загрузке команды ${file}: ${error.message}`);
    }
}

client.once('ready', async () => {
    logger.info('Бот успешно запущен!');
    client.user.setActivity('на GTAX', { type: ActivityType.Playing });

    // Отправляем сообщение в restrictedChannelId
    await sendRestrictedMessage(client, logger, config);
    // Отправляем сообщение с кнопкой для создания тикета
    await setupTicketMessage(client);
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command) {
                await command.execute(interaction);
                logger.info(`Команда ${interaction.commandName} успешно выполнена пользователем ${interaction.user.tag}`);
            }
        } else if (interaction.isButton() || interaction.isModalSubmit()) {
            // Обработка тикетных взаимодействий
            await handleTicketInteraction(interaction, client);
        } else if (interaction.isStringSelectMenu()) {
            // Обработка взаимодействий с голосовыми каналами
            await handleSelectMenuInteraction(interaction);
        }
    } catch (error) {
        logger.error(`Ошибка при обработке взаимодействия: ${error.message}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Произошла ошибка при обработке вашего запроса.', ephemeral: true });
        }
    }
});

async function handleButtonInteraction(interaction) {
    if (interaction.replied || interaction.deferred) {
        logger.warn('Взаимодействие уже завершено, невозможно повторно обработать.');
        return;
    }

    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
        return interaction.reply({ content: 'Вы должны находиться в голосовом канале, чтобы управлять им.', ephemeral: true });
    }

    const ownerId = voiceChannel.permissionOverwrites.cache.find(po => po.allow.has(PermissionsBitField.Flags.ManageChannels))?.id;
    if (ownerId !== member.id) {
        return interaction.reply({ content: 'Вы можете управлять только своим приватным каналом.', ephemeral: true });
    }

    switch (interaction.customId) {
        case 'rename_channel':
            await interaction.reply({ content: 'Введите новое название для канала в этом чате.', ephemeral: true });
            await startMessageCollector(interaction, 'rename');
            break;

        case 'assign_owner':
            await interaction.reply({ content: 'Тегните нового владельца канала в этом чате.', ephemeral: true });
            await startMessageCollector(interaction, 'assign_owner');
            break;

        case 'limit_access':
            await interaction.reply({ content: 'Тегните пользователя для ограничения доступа в этом чате.', ephemeral: true });
            await startMessageCollector(interaction, 'limit_access');
            break;

        case 'set_limit':
            await interaction.reply({ content: 'Введите новый лимит участников (1-99) в этом чате.', ephemeral: true });
            await startMessageCollector(interaction, 'set_limit');
            break;

        case 'toggle_lock':
            const isLocked = voiceChannel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id)?.deny.has(PermissionsBitField.Flags.Connect);
            await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: isLocked });
            await interaction.reply({ content: `Комната ${isLocked ? 'открыта' : 'закрыта'}.`, ephemeral: true });
            break;

        case 'toggle_visibility':
            const isHidden = voiceChannel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id)?.deny.has(PermissionsBitField.Flags.ViewChannel);
            await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: isHidden });
            await interaction.reply({ content: `Комната ${isHidden ? 'показана' : 'скрыта'}.`, ephemeral: true });
            break;

        case 'kick_user':
            await interaction.reply({ content: 'Тегните пользователя для выгона в этом чате.', ephemeral: true });
            await startMessageCollector(interaction, 'kick_user');
            break;

        case 'toggle_speak':
            await interaction.reply({ content: 'Тегните пользователя для ограничения права говорить в этом чате.', ephemeral: true });
            await startMessageCollector(interaction, 'toggle_speak');
            break;
    }
}

async function handleModalSubmit(interaction) {
    if (interaction.customId === 'renameChannelModal') {
        const newChannelName = interaction.fields.getTextInputValue('newChannelName');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: 'Вы должны находиться в голосовом канале, чтобы изменить его название.', ephemeral: true });
        }

        const ownerId = voiceChannel.permissionOverwrites.cache.find(po => po.allow.has(PermissionsBitField.Flags.ManageChannels))?.id;
        if (ownerId !== member.id) {
            return interaction.reply({ content: 'Вы можете управлять только своим приватным каналом.', ephemeral: true });
        }

        await voiceChannel.setName(newChannelName);
        await interaction.reply({ content: `Название канала изменено на ${newChannelName}.`, ephemeral: true });
    }
}

async function handleSelectMenuInteraction(interaction) {
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
        return interaction.reply({ content: 'Вы должны находиться в голосовом канале, чтобы управлять им.', ephemeral: true });
    }

    switch (interaction.customId) {
        case 'selectOwner':
            const newOwnerId = interaction.values[0];
            await voiceChannel.permissionOverwrites.edit(newOwnerId, { ManageChannels: true });
            await voiceChannel.permissionOverwrites.delete(member.id);
            await interaction.update({ content: `Новый владелец канала: <@${newOwnerId}>`, components: [] });
            break;

        case 'selectAccess':
            const accessUserId = interaction.values[0];
            const accessDenied = voiceChannel.permissionOverwrites.cache.get(accessUserId)?.deny.has(PermissionsBitField.Flags.Connect);
            await voiceChannel.permissionOverwrites.edit(accessUserId, { Connect: !accessDenied });
            await interaction.update({ content: `Доступ для <@${accessUserId}> ${accessDenied ? 'разрешен' : 'ограничен'}.`, components: [] });
            break;

        case 'selectKickUser':
            const kickUserId = interaction.values[0];
            const kickMember = voiceChannel.guild.members.cache.get(kickUserId);
            if (kickMember) {
                await kickMember.voice.disconnect();
                await interaction.update({ content: `<@${kickUserId}> был выгнан из комнаты.`, components: [] });
            } else {
                await interaction.update({ content: `Пользователь не найден.`, components: [] });
            }
            break;

        case 'selectSpeakUser':
            const speakUserId = interaction.values[0];
            const speakDenied = voiceChannel.permissionOverwrites.cache.get(speakUserId)?.deny.has(PermissionsBitField.Flags.Speak);
            await voiceChannel.permissionOverwrites.edit(speakUserId, { Speak: !speakDenied });
            await interaction.update({ content: `Право говорить для <@${speakUserId}> ${speakDenied ? 'разрешено' : 'ограничено'}.`, components: [] });
            break;
    }
}

async function startMessageCollector(interaction, action) {
    const filter = m => m.author.id === interaction.user.id && !m.author.bot;
    const collector = interaction.channel.createMessageCollector({ filter, time: 30000 });

    collector.on('collect', async message => {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            await interaction.followUp({ content: 'Вы должны находиться в голосовом канале, чтобы управлять им.', ephemeral: true });
            return collector.stop();
        }

        switch (action) {
            case 'rename':
                await voiceChannel.setName(message.content);
                await interaction.followUp({ content: `Название канала изменено на ${message.content}.`, ephemeral: true });
                break;

            case 'assign_owner':
                const newOwner = message.mentions.members.first();
                if (newOwner) {
                    await voiceChannel.permissionOverwrites.edit(newOwner.id, { ManageChannels: true });
                    await voiceChannel.permissionOverwrites.delete(member.id);
                    await interaction.followUp({ content: `Новый владелец канала: ${newOwner}.`, ephemeral: true });
                } else {
                    await interaction.followUp({ content: 'Не удалось найти упомянутого пользователя.', ephemeral: true });
                }
                break;

            case 'limit_access':
                const limitUser = message.mentions.members.first();
                if (limitUser) {
                    const accessDenied = voiceChannel.permissionOverwrites.cache.get(limitUser.id)?.deny.has(PermissionsBitField.Flags.Connect);
                    await voiceChannel.permissionOverwrites.edit(limitUser.id, { Connect: !accessDenied });
                    await interaction.followUp({ content: `Доступ для ${limitUser} ${accessDenied ? 'разрешен' : 'ограничен'}.`, ephemeral: true });
                } else {
                    await interaction.followUp({ content: 'Не удалось найти упомянутого пользователя.', ephemeral: true });
                }
                break;

            case 'set_limit':
                const limit = parseInt(message.content);
                if (!isNaN(limit) && limit > 0 && limit <= 99) {
                    await voiceChannel.setUserLimit(limit);
                    await interaction.followUp({ content: `Лимит участников в канале установлен на ${limit}.`, ephemeral: true });
                } else {
                    await interaction.followUp({ content: 'Пожалуйста, введите допустимое число от 1 до 99.', ephemeral: true });
                }
                break;

            case 'kick_user':
                const kickUser = message.mentions.members.first();
                if (kickUser && kickUser.voice.channel && kickUser.voice.channel.id === voiceChannel.id) {
                    await kickUser.voice.disconnect();
                    await interaction.followUp({ content: `${kickUser} был выгнан из комнаты.`, ephemeral: true });
                } else {
                    await interaction.followUp({ content: 'Не удалось найти упомянутого пользователя или пользователь не находится в вашем канале.', ephemeral: true });
                }
                break;

            case 'toggle_speak':
                const speakUser = message.mentions.members.first();
                if (speakUser) {
                    const speakDenied = voiceChannel.permissionOverwrites.cache.get(speakUser.id)?.deny.has(PermissionsBitField.Flags.Speak);
                    await voiceChannel.permissionOverwrites.edit(speakUser.id, { Speak: !speakDenied });
                    await interaction.followUp({ content: `Право говорить для ${speakUser} ${speakDenied ? 'разрешено' : 'ограничено'}.`, ephemeral: true });
                } else {
                    await interaction.followUp({ content: 'Не удалось найти упомянутого пользователя.', ephemeral: true });
                }
                break;
        }

        await message.delete();
        collector.stop();
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.followUp({ content: 'Время ожидания ввода истекло.', ephemeral: true });
        }
    });
}

client.on('voiceStateUpdate', async (oldState, newState) => {
    const { triggerVoiceChannelId, privateChannelCategoryId } = config;

    if (newState.channelId === triggerVoiceChannelId) {
        try {
            const privateChannel = await newState.guild.channels.create({
                name: `Канал ${newState.member.user.username}`,
                type: ChannelType.GuildVoice,
                parent: privateChannelCategoryId,
                userLimit: 99,
                permissionOverwrites: [
                    {
                        id: newState.member.id,
                        allow: [
                            PermissionsBitField.Flags.ManageChannels,
                            PermissionsBitField.Flags.MoveMembers,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.Speak
                        ]
                    },
                    {
                        id: newState.guild.roles.everyone,
                        deny: [PermissionsBitField.Flags.Connect]
                    }
                ]
            });

            await newState.member.voice.setChannel(privateChannel);
            logger.info(`Создан новый приватный канал для пользователя ${newState.member.user.tag}`);
        } catch (error) {
            logger.error(`Ошибка при создании приватного канала: ${error.message}`);
        }
    }

    if (
        oldState.channel &&
        oldState.channel.members.size === 0 &&
        oldState.channel.parentId === privateChannelCategoryId &&
        oldState.channel.id !== triggerVoiceChannelId
    ) {
        try {
            const channelToDelete = oldState.guild.channels.cache.get(oldState.channel.id);
            if (channelToDelete) {
                await channelToDelete.delete();
                logger.info(`Удален пустой приватный канал ${oldState.channel.name}`);
            } else {
                logger.warn(`Канал уже был удален: ${oldState.channel.name}`);
            }
        } catch (error) {
            logger.error(`Ошибка при удалении приватного канала: ${error.message}`);
        }
    }
});

setInterval(() => {
    const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    Object.assign(config, updatedConfig);
}, 2000);

client.login(config.token).catch(err => {
    logger.error(`Ошибка при запуске бота: ${err.message}`);
});
