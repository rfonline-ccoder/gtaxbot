import { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } from 'discord.js';
import config from './config.json' assert { type: 'json' };

export default {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Снимает мут с пользователя')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('Пользователь для размут')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('Причина размута')
                .setRequired(true)),  // Делаем причину обязательной

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const member = interaction.options.getMember('target');
            const reason = interaction.options.getString('reason');

            // Проверяем, найден ли пользователь
            if (!member) {
                return interaction.editReply({ content: 'Пользователь не найден на сервере.', ephemeral: true });
            }

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return interaction.editReply({ content: 'У вас недостаточно прав для выполнения этой команды.', ephemeral: true });
            }

            const muteRole = interaction.guild.roles.cache.find(role => role.name === 'Muted');
            if (muteRole && member.roles.cache.has(muteRole.id)) {
                await member.roles.remove(muteRole, reason);
                await interaction.editReply({ content: `${member.user.tag} был размучен. Причина: ${reason}` });

                const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('Unmute')
                        .addFields(
                            { name: 'Модератор', value: interaction.user.tag, inline: true },
                            { name: 'Пользователь', value: member.user.tag, inline: true },
                            { name: 'Причина', value: reason }
                        )
                        .setColor(Colors.Green);
                    logChannel.send({ embeds: [embed] });
                }
            } else {
                await interaction.editReply({ content: 'Этот пользователь не замучен или роль "Muted" не найдена.' });
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
