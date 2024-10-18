import { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } from 'discord.js';
import config from './config.json' assert { type: 'json' };

export default {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Снимает ограничение с пользователя')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('Пользователь для снятия ограничения')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const member = interaction.options.getMember('target');

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return interaction.editReply({ content: 'У вас недостаточно прав для выполнения этой команды.' });
            }

            // Проверяем, есть ли у пользователя роль "Restricted"
            let restrictedRole = interaction.guild.roles.cache.find(role => role.name === 'Restricted');
            if (!restrictedRole) {
                return interaction.editReply({ content: 'Роль "Restricted" не найдена на сервере.' });
            }

            if (!member.roles.cache.has(restrictedRole.id)) {
                return interaction.editReply({ content: 'У этого пользователя нет ограничения.' });
            }

            // Снимаем роль "Restricted"
            await member.roles.remove(restrictedRole);

            await interaction.editReply({ content: `${member.user.tag} был снят с ограничения.` });

            const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('Снятие ограничения')
                    .addFields(
                        { name: 'Модератор', value: interaction.user.tag, inline: true },
                        { name: 'Пользователь', value: member.user.tag, inline: true }
                    )
                    .setColor(Colors.Green);
                logChannel.send({ embeds: [embed] });
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
