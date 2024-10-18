import { promises as fs } from 'fs';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } from 'discord.js';

// Создаем Map для хранения времени последнего взаимодействия пользователя с модальным окном
const lastInteractionTimes = new Map();

export default async function sendRestrictedMessage(client, logger, config) {
    try {
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) {
            throw new Error('Гильдия не найдена.');
        }

        const restrictedChannel = guild.channels.cache.get(config.restrictedChannelId);
        if (!restrictedChannel) {
            throw new Error('Канал для ограниченных пользователей не найден.');
        }

        const embed = new EmbedBuilder()
            .setTitle('Вы были наказаны')
            .setDescription('Вы были наказаны за нарушение правил сообщества, а именно правил дискорда.\n\n' +
                'Бан причина: \n' +
                'Срок бана:\n\n' +
                'Чтобы подать аппеляцию на разбан, заполните форму по кнопке ниже.')
            .setColor(0xff0000);

        const button = new ButtonBuilder()
            .setCustomId('appealButton')
            .setLabel('Подать аппеляцию')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        // Проверка наличия сообщения в конфиге
        let messageId = config.restrictedMessageId;
        let message;

        if (messageId) {
            try {
                message = await restrictedChannel.messages.fetch(messageId);
            } catch (error) {
                logger.warn('Сообщение не найдено, будет создано новое.');
            }
        }

        // Если сообщение не найдено или не существует, отправляем новое
        if (!message) {
            message = await restrictedChannel.send({ embeds: [embed], components: [row] });
            config.restrictedMessageId = message.id;
            await fs.writeFile('./config.json', JSON.stringify(config, null, 2)); // Сохранение ID сообщения
        }

        client.on('interactionCreate', async interaction => {
            if (interaction.isButton() && interaction.customId === 'appealButton') {
                const userId = interaction.user.id;
                const currentTime = Date.now();

                // Проверка, отправлял ли пользователь форму в последний час
                if (lastInteractionTimes.has(userId)) {
                    const lastTime = lastInteractionTimes.get(userId);
                    const timePassed = currentTime - lastTime;

                    if (timePassed < 60 * 60 * 1000) { // 1 час в миллисекундах
                        await interaction.reply({ content: 'Вы уже отправляли апелляцию в последний час. Пожалуйста, попробуйте позже.', ephemeral: true });
                        return;
                    }
                }

                lastInteractionTimes.set(userId, currentTime);

                const modal = new ModalBuilder()
                    .setCustomId('appealModal')
                    .setTitle('Апелляция на разбан');

                const appealReasonInput = new TextInputBuilder()
                    .setCustomId('appealReason')
                    .setLabel('Почему наказание должно быть снято')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(appealReasonInput)
                );

                try {
                    await interaction.showModal(modal);
                } catch (error) {
                    logger.error(`Ошибка при открытии модального окна: ${error.message}`);
                }
            }

            if (interaction.isModalSubmit() && interaction.customId === 'appealModal') {
                const appealReason = interaction.fields.getTextInputValue('appealReason');

                const appealChannel = guild.channels.cache.get(config.appealChannelId);
                if (!appealChannel) {
                    logger.error('Канал для апелляций не найден.');
                    return;
                }

                const appealEmbed = new EmbedBuilder()
                    .setTitle('Новая апелляция на разбан')
                    .addFields(
                        { name: 'Пользователь:', value: `<@${interaction.user.id}>` },
                        { name: 'Причина для снятия наказания:', value: appealReason }
                    )
                    .setColor(0xffa500);

                await appealChannel.send({ embeds: [appealEmbed] });

                await interaction.reply({ content: 'Ваша апелляция была отправлена. Ожидайте ответа.', ephemeral: true });
            }
        });

        // Отправка личного сообщения пользователю
        const restrictedRole = guild.roles.cache.find(role => role.name === 'Restricted');
        if (restrictedRole) {
            for (const member of restrictedRole.members.values()) {
                try {
                    await member.send(`Вы были наказаны модератором ${config.bannedBy} за следующее: ${config.banReason}. Срок наказания: ${config.banDuration} дней.`);
                    logger.info(`Сообщение о наказании отправлено пользователю ${member.user.tag}.`);
                } catch (error) {
                    logger.error(`Не удалось отправить сообщение пользователю ${member.user.tag}: ${error.message}`);
                }
            }
        }

    } catch (error) {
        logger.error(`Ошибка при отправке сообщения в канал restricted: ${error.message}`);
    }
}
