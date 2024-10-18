import { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } from 'discord.js';
import config from './config.json' assert { type: 'json' };

export default {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Мутит пользователя на определенное время (в минутах)')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('Пользователь для мута')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('duration')
                .setDescription('Длительность мута в минутах')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('Причина мута')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const moderator = interaction.user;
            const member = interaction.options.getMember('target');
            const duration = interaction.options.getInteger('duration');
            const reason = interaction.options.getString('reason');

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return interaction.editReply({ content: 'У вас недостаточно прав для выполнения этой команды.' });
            }

            let muteRole = interaction.guild.roles.cache.find(role => role.name === 'Muted');
            if (!muteRole) {
                muteRole = await interaction.guild.roles.create({
                    name: 'Muted',
                    permissions: []
                });

                interaction.guild.channels.cache.forEach(channel => {
                    channel.permissionOverwrites.create(muteRole, {
                        SEND_MESSAGES: false,
                        SPEAK: false
                    });
                });
            }

            await member.roles.add(muteRole, reason);
            await interaction.editReply({ content: `${member.user.tag} был замучен на ${duration} минут. Причина: ${reason}` });

            const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('Mute')
                    .addFields(
                        { name: 'Модератор', value: moderator.tag, inline: true },
                        { name: 'Пользователь', value: member.user.tag, inline: true },
                        { name: 'Длительность', value: `${duration} минут`, inline: true },
                        { name: 'Причина', value: reason }
                    )
                    .setColor(Colors.Orange);
                logChannel.send({ embeds: [embed] });
            }

            setTimeout(async () => {
                try {
                    const guildMember = interaction.guild.members.cache.get(member.id);
                    if (guildMember) {
                        await guildMember.roles.remove(muteRole);

                        const unmuteLogChannel = interaction.guild.channels.cache.get(config.logChannelId);
                        if (unmuteLogChannel) {
                            const unmuteEmbed = new EmbedBuilder()
                                .setTitle('Unmute')
                                .addFields(
                                    { name: 'Модератор', value: 'Автоматически', inline: true },
                                    { name: 'Пользователь', value: guildMember.user.tag, inline: true }
                                )
                                .setColor(Colors.Green);
                            unmuteLogChannel.send({ embeds: [unmuteEmbed] });
                        } else {
                            console.log('Лог-канал для снятия мута не найден.');
                        }
                    } else {
                        console.log('Пользователь не найден на сервере.');
                    }
                } catch (error) {
                    console.error('Ошибка при снятии мута:', error);
                }
            }, duration * 60 * 1000);
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
