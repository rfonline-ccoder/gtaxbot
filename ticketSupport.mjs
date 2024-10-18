import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionsBitField, ChannelType, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import config from './config.json' assert { type: 'json' };

export async function setupTicketMessage(client) {
    const guild = client.guilds.cache.get(config.guildId);
    const channel = guild.channels.cache.get(config.ticketChannelId); 

    if (!channel) {
        console.error(`Канал с ID ${config.ticketChannelId} не найден.`);
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('Сообщить о проблеме')
        .setDescription('Если у Вас возникли проблемы с проектом, нажмите внизу кнопку. \n Наша команда технической поддержки будет рада помочь Вам решить любые технические вопросы или проблемы, с которыми Вы столкнулись. \n Пожалуйста, опишите свою проблему как можно подробнее, чтобы мы могли быстрее и эффективнее помочь вам. \n Просьба не создавать просто так тикет, это наказуемо. Спасибо за ваше понимание!')
        .setColor(0x00AE86)
        .setImage('https://media.discordapp.net/attachments/1257362737596600327/1270884263641747630/woqqvzE_95s.jpg?ex=66b552b4&is=66b40134&hm=6cd4718878124792e94f974ebb8297c53c1fe7aa1258ce1c4a963b94512df6ef&=&format=webp&width=676&height=676'); // Укажите URL изображения, если оно нужно

    const button = new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('Создать тикет')
        .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    try {
        await channel.send({ embeds: [embed], components: [row] });
        console.log('Сообщение с кнопкой для создания тикета успешно отправлено.');
    } catch (error) {
        console.error('Ошибка при отправке сообщения в канал:', error);
    }
}

export async function handleTicketInteraction(interaction, client) {
    if (interaction.customId === 'create_ticket') {
        const modal = new ModalBuilder()
            .setCustomId('ticketModal')
            .setTitle('Создать тикет');

        const nicknameInput = new TextInputBuilder()
            .setCustomId('nickname')
            .setLabel('Ваш НикНейм')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const idInput = new TextInputBuilder()
            .setCustomId('staticId')
            .setLabel('Ваш статический айди')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const issueInput = new TextInputBuilder()
            .setCustomId('issueDescription')
            .setLabel('Суть проблемы')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const evidenceInput = new TextInputBuilder()
            .setCustomId('evidenceLink')
            .setLabel('Доказательства (imgur/youtube/yapx)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nicknameInput),
            new ActionRowBuilder().addComponents(idInput),
            new ActionRowBuilder().addComponents(issueInput),
            new ActionRowBuilder().addComponents(evidenceInput)
        );

        await interaction.showModal(modal);
    } else if (interaction.isModalSubmit() && interaction.customId === 'ticketModal') {
        const nickname = interaction.fields.getTextInputValue('nickname');
        const staticId = interaction.fields.getTextInputValue('staticId');
        const issueDescription = interaction.fields.getTextInputValue('issueDescription');
        const evidenceLink = interaction.fields.getTextInputValue('evidenceLink') || 'Не предоставлено';

        const guild = client.guilds.cache.get(config.guildId);
        const category = guild.channels.cache.get(config.ticketCategoryId);
        const adminRole = guild.roles.cache.get(config.adminRoleId);

        const ticketChannel = await guild.channels.create({
            name: `тикет-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites: [
                {
                    id: interaction.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                },
                {
                    id: adminRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                },
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                }
            ]
        });

        const ticketEmbed = new EmbedBuilder()
            .setTitle('Новый тикет')
            .addFields(
                { name: 'Никнейм', value: nickname },
                { name: 'Статический ID', value: staticId },
                { name: 'Суть проблемы', value: issueDescription },
                { name: 'Доказательства', value: evidenceLink }
            )
            .setColor(0xffa500);

        const resolveButton = new ButtonBuilder()
            .setCustomId('resolve_ticket')
            .setLabel('Проблема решена')
            .setStyle(ButtonStyle.Primary);

        const closeButton = new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Закрыть тикет')
            .setStyle(ButtonStyle.Danger);

        const notRelevantButton = new ButtonBuilder()
            .setCustomId('not_relevant_ticket')
            .setLabel('Неактуально')
            .setStyle(ButtonStyle.Secondary);

        const actionRow = new ActionRowBuilder().addComponents(resolveButton, closeButton, notRelevantButton);

        await ticketChannel.send({ embeds: [ticketEmbed], components: [actionRow] });

        await interaction.reply({ content: `Тикет создан: ${ticketChannel}`, ephemeral: true });
    } else if (interaction.isButton()) {
        const ticketChannel = interaction.channel;

        if (interaction.customId === 'resolve_ticket') {
            const closeTicketButton = new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Закрыть тикет')
                .setStyle(ButtonStyle.Danger);

            const actionRow = new ActionRowBuilder().addComponents(closeTicketButton);

            await ticketChannel.send({ content: 'Рады, что ваша проблема была решена! Нажмите "Закрыть тикет", чтобы удалить канал.', components: [actionRow] });
        } else if (interaction.customId === 'not_relevant_ticket') {
            const closeTicketButton = new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Закрыть тикет')
                .setStyle(ButtonStyle.Danger);

            const actionRow = new ActionRowBuilder().addComponents(closeTicketButton);

            await ticketChannel.send({ content: 'Надеемся, что ваша проблема была решена! Нажмите "Закрыть тикет", чтобы удалить канал.', components: [actionRow] });
        } else if (interaction.customId === 'close_ticket') {
            await ticketChannel.delete();
        }
    }
}
