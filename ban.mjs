import fs from 'fs';
import { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } from 'discord.js';
import config from './config.json' assert { type: 'json' };

export default {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ограничивает доступ пользователя, выдавая специальную роль')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('Пользователь для ограничения')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('duration')
                .setDescription('Длительность ограничения в днях')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('Причина ограничения')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const moderator = interaction.user;
            const member = interaction.options.getMember('target');
            const duration = interaction.options.getInteger('duration');
            const reason = interaction.options.getString('reason');

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return interaction.editReply({ content: 'У вас недостаточно прав для выполнения этой команды.' });
            }

            let restrictedRole = interaction.guild.roles.cache.find(role => role.name === 'Restricted');
            if (!restrictedRole) {
                restrictedRole = await interaction.guild.roles.create({
                    name: 'Restricted',
                    permissions: [],
                    color: Colors.DarkRed,
                    reason: 'Создана роль для ограничения доступа'
                });

                // Настройка ограничения доступа ко всем каналам кроме одного
                interaction.guild.channels.cache.forEach(channel => {
                    if (channel.id === config.restrictedChannelId) { // Канал, к которому будет доступ
                        if (channel) {
                            channel.permissionOverwrites.create(restrictedRole, {
                                [PermissionsBitField.Flags.ViewChannel]: true,
                                [PermissionsBitField.Flags.SendMessages]: true
                            }).catch(console.error);
                        }
                    } else {
                        if (channel) {
                            channel.permissionOverwrites.create(restrictedRole, {
                                [PermissionsBitField.Flags.ViewChannel]: false,
                                [PermissionsBitField.Flags.SendMessages]: false
                            }).catch(console.error);
                        }
                    }
                });
            }

            await member.roles.add(restrictedRole, reason);
            await interaction.editReply({ content: `${member.user.tag} был ограничен в доступе на ${duration} дней. Причина: ${reason}` });

            const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('Ограничение доступа')
                    .addFields(
                        { name: 'Модератор', value: moderator.tag, inline: true },
                        { name: 'Пользователь', value: member.user.tag, inline: true },
                        { name: 'Длительность', value: `${duration} дней`, inline: true },
                        { name: 'Причина', value: reason }
                    )
                    .setColor(Colors.DarkRed);
                logChannel.send({ embeds: [embed] }).catch(console.error);
            }

            setTimeout(async () => {
                // Убираем роль ограничения по истечении срока
                await member.roles.remove(restrictedRole).catch(console.error);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('Снятие ограничения')
                        .addFields(
                            { name: 'Модератор', value: 'Автоматически', inline: true },
                            { name: 'Пользователь', value: member.user.tag, inline: true }
                        )
                        .setColor(Colors.Green);
                    logChannel.send({ embeds: [embed] }).catch(console.error);
                }
            }, duration * 24 * 60 * 60 * 1000); // Переводим дни в миллисекунды
        } catch (error) {
            console.error(error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: 'Произошла ошибка при выполнении команды.' });
            } else {
                await interaction.reply({ content: 'Произошла ошибка при выполнении команды.', ephemeral: true });
            }
        }
    },
};
