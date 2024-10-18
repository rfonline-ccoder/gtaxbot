import { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } from 'discord.js';
import config from './config.json' assert { type: 'json' };

export default {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Кикает пользователя с сервера')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('Пользователь для кика')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('Причина кика')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const moderator = interaction.user;
            const member = interaction.options.getMember('target');
            const reason = interaction.options.getString('reason');

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                return interaction.editReply({ content: 'У вас недостаточно прав для выполнения этой команды.' });
            }

            try {
                await member.kick(reason);
                await interaction.editReply({ content: `${member.user.tag} был кикнут. Причина: ${reason}` });

                const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('Kick')
                        .addFields(
                            { name: 'Модератор', value: moderator.tag, inline: true },
                            { name: 'Пользователь', value: member.user.tag, inline: true },
                            { name: 'Причина', value: reason }
                        )
                        .setColor(Colors.Orange); // Используем правильную константу для цвета
                    logChannel.send({ embeds: [embed] });
                }
            } catch (error) {
                console.error(error);
                await interaction.editReply({ content: 'Произошла ошибка при попытке кикнуть пользователя.' });
            }
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
