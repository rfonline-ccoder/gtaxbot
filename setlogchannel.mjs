import { SlashCommandBuilder, ChannelType, PermissionsBitField, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import fs from 'fs';
import config from './config.json' assert { type: 'json' };

export default {
    data: new SlashCommandBuilder()
        .setName('setlogchannel')
        .setDescription('Устанавливает канал логирования')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.roles.cache.has(config.allowedRoleId)) {
            return interaction.editReply({ content: 'У вас недостаточно прав для выполнения этой команды.' });
        }

        const channels = interaction.guild.channels.cache
            .filter(channel => channel.type === ChannelType.GuildText)
            .map(channel => ({ label: channel.name, value: channel.id }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('selectLogChannel')
            .setPlaceholder('Выберите канал для логирования')
            .addOptions(channels);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.editReply({ content: 'Выберите канал для логирования:', components: [row] });

        const filter = i => i.customId === 'selectLogChannel' && i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });

        collector.on('collect', async i => {
            const selectedChannelId = i.values[0];
            config.logChannelId = selectedChannelId;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));

            await i.deferUpdate(); // Используем deferUpdate вместо update для подтверждения действия
            await interaction.editReply({ content: `Канал логирования изменен на <#${selectedChannelId}>`, components: [] });
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({ content: 'Время выбора канала истекло.', components: [] });
            }
        });
    },
};
