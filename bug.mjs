import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, Colors, EmbedBuilder } from 'discord.js';
import config from './config.json' assert { type: 'json' };

export default {
    data: new SlashCommandBuilder()
        .setName('bug')
        .setDescription('Отправить баг-репорт'),

    async execute(interaction) {
        // Создаем модальное окно
        const modal = new ModalBuilder()
            .setCustomId('bugReportModal')
            .setTitle('Баг-репорт');

        // Поле для ввода никнейма
        const nicknameInput = new TextInputBuilder()
            .setCustomId('nickname')
            .setLabel('Ваш никнейм')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // Поле для ввода статического ID
        const idInput = new TextInputBuilder()
            .setCustomId('staticId')
            .setLabel('Ваш статический ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // Поле для описания сути бага
        const descriptionInput = new TextInputBuilder()
            .setCustomId('bugDescription')
            .setLabel('Суть бага')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        // Поле для ввода доказательств
        const evidenceInput = new TextInputBuilder()
            .setCustomId('bugEvidence')
            .setLabel('Доказательства (ссылка или описание)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        // Создаем ряды компонентов
        const firstActionRow = new ActionRowBuilder().addComponents(nicknameInput);
        const secondActionRow = new ActionRowBuilder().addComponents(idInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(descriptionInput);
        const fourthActionRow = new ActionRowBuilder().addComponents(evidenceInput);

        // Добавляем все ряды в модальное окно
        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow);

        // Открываем модальное окно для пользователя
        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        try {
            // Получаем значения из модального окна
            const nickname = interaction.fields.getTextInputValue('nickname');
            const staticId = interaction.fields.getTextInputValue('staticId');
            const description = interaction.fields.getTextInputValue('bugDescription');
            const evidence = interaction.fields.getTextInputValue('bugEvidence') || 'Не предоставлено';

            // Формируем сообщение для отправки в канал
            const embed = new EmbedBuilder()
                .setTitle('Новый баг-репорт')
                .addFields(
                    { name: 'Никнейм', value: nickname, inline: true },
                    { name: 'Статический ID', value: staticId, inline: true },
                    { name: 'Описание бага', value: description, inline: false },
                    { name: 'Доказательства', value: evidence, inline: false }
                )
                .setColor(Colors.Red);

            const bugChannel = interaction.guild.channels.cache.get(config.bugReportChannelId);

            if (bugChannel) {
                // Проверяем наличие вложений (если они поддерживаются)
                const attachment = interaction.attachments?.first();

                if (attachment) {
                    await bugChannel.send({ embeds: [embed], files: [attachment] });
                } else {
                    await bugChannel.send({ embeds: [embed] });
                }

                await interaction.reply({ content: 'Ваш баг-репорт был успешно отправлен.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Ошибка: Канал для баг-репортов не найден.', ephemeral: true });
            }
        } catch (error) {
            console.error('Ошибка при отправке баг-репорта:', error);
            await interaction.reply({ content: 'Произошла ошибка при отправке баг-репорта. Пожалуйста, попробуйте позже.', ephemeral: true });
        }
    }
};
