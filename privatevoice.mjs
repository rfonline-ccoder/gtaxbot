import { SlashCommandBuilder, ChannelType, PermissionsBitField, EmbedBuilder, ButtonStyle } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    data: new SlashCommandBuilder()
        .setName('privatevoice')
        .setDescription('Включает или отключает приватные каналы'),

    async execute(interaction) {
        const guild = interaction.guild;
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        // Проверка на наличие нужной роли
        const requiredRoleId = config.requiredRoleId;
        if (!interaction.member.roles.cache.has(requiredRoleId)) {
            return interaction.reply({ content: 'У вас нет прав на выполнение этой команды.', ephemeral: true });
        }

        let category = guild.channels.cache.find(c => c.name === 'Приватные каналы' && c.type === ChannelType.GuildCategory);
        let triggerChannel = guild.channels.cache.find(c => c.name === 'Создать приватный канал' && c.parentId === category?.id && c.type === ChannelType.GuildVoice);
        let textChannel = guild.channels.cache.find(c => c.name === 'управление-комнатами' && c.parentId === category?.id && c.type === ChannelType.GuildText);

        if (category && triggerChannel && textChannel) {
            // Удаление категории и всех ее каналов
            const channels = category.children.cache.map(channel => channel);
            for (const channel of channels) {
                await channel.delete();
            }
            await category.delete();

            // Обновление конфигурации
            config.privateChannelCategoryId = "";
            config.triggerVoiceChannelId = "";
            config.managementChannelId = "";
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            return interaction.reply({ content: 'Приватные каналы отключены и удалены.', ephemeral: true });
        } else {
            // Создание категории
            category = await guild.channels.create({
                name: 'Приватные каналы',
                type: ChannelType.GuildCategory,
            });

            // Создание триггерного канала
            triggerChannel = await guild.channels.create({
                name: 'Создать приватный канал',
                type: ChannelType.GuildVoice,
                parent: category.id,
            });

            // Обновление ID триггерного канала в конфигурации
            config.triggerVoiceChannelId = triggerChannel.id;

            // Создание текстового канала для управления
            textChannel = await guild.channels.create({
                name: 'управление-комнатами',
                type: ChannelType.GuildText,
                parent: category.id,
            });

            // Обновление конфигурации
            config.privateChannelCategoryId = category.id;
            config.managementChannelId = textChannel.id;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Отправляем сообщение с кнопками управления приватными каналами
            const embed = new EmbedBuilder()
                .setTitle('Управление приватными комнатами')
                .setDescription(`
                    Назначить нового создателя комнаты
                    Ограничить/выдать доступ к комнате
                    Задать новый лимит участников
                    Закрыть/открыть комнату
                    Изменить название комнаты
                    Скрыть/показать комнату
                    Выгнать участника из комнаты
                    Ограничить/выдать право говорить
                `)
                .setColor(0x808080);

            const buttons1 = {
                type: 1,
                components: [
                    {
                        type: 2,
                        customId: 'rename_channel',
                        label: 'Изменить название',
                        style: ButtonStyle.Secondary
                    },
                    {
                        type: 2,
                        customId: 'assign_owner',
                        label: 'Назначить владельца',
                        style: ButtonStyle.Secondary
                    },
                    {
                        type: 2,
                        customId: 'limit_access',
                        label: 'Ограничить доступ',
                        style: ButtonStyle.Secondary
                    },
                    {
                        type: 2,
                        customId: 'set_limit',
                        label: 'Задать лимит',
                        style: ButtonStyle.Secondary
                    }
                ]
            };

            const buttons2 = {
                type: 1,
                components: [
                    {
                        type: 2,
                        customId: 'toggle_lock',
                        label: 'Закрыть/открыть комнату',
                        style: ButtonStyle.Secondary
                    },
                    {
                        type: 2,
                        customId: 'toggle_visibility',
                        label: 'Скрыть/показать комнату',
                        style: ButtonStyle.Secondary
                    },
                    {
                        type: 2,
                        customId: 'kick_user',
                        label: 'Выгнать участника',
                        style: ButtonStyle.Secondary
                    },
                    {
                        type: 2,
                        customId: 'toggle_speak',
                        label: 'Ограничить право говорить',
                        style: ButtonStyle.Secondary
                    }
                ]
            };

            await textChannel.send({
                content: 'Информация о создании и управлении приватными каналами:',
                embeds: [embed],
                components: [buttons1, buttons2]
            });

            return interaction.reply({ content: 'Приватные каналы запущены и готовы к использованию.', ephemeral: true });
        }
    }
};
