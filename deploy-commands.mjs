import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import winston from 'winston';

// Получение пути файла и директории
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Импорт JSON с использованием fs и path
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Настройка логирования с помощью winston
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(info => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`),
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'command-deploy.log' })
    ],
});

const commands = [];
const commandFiles = fs.readdirSync(__dirname).filter(file => file.endsWith('.mjs') && file !== 'index.mjs' && file !== 'deploy-commands.mjs');

for (const file of commandFiles) {
    try {
        const filePath = pathToFileURL(path.join(__dirname, file)).href;
        const command = await import(filePath);
        if ('data' in command.default && 'execute' in command.default) {
            commands.push(command.default.data.toJSON());
            logger.info(`Команда ${file} успешно добавлена для регистрации.`);
        } else {
            logger.warn(`Команда ${file} пропущена, так как она не содержит обязательные свойства 'data' или 'execute'.`);
        }
    } catch (error) {
        logger.error(`Ошибка при загрузке команды ${file}: ${error.message}`);
    }
}

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        logger.info('Начинается регистрация (загрузка) слэш-команд.');

        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands },
        );

        logger.info('Слэш-команды успешно зарегистрированы.');
    } catch (error) {
        logger.error(`Ошибка при регистрации слэш-команд: ${error.message}`);
    }
})();
