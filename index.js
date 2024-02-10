const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const PREFIX = "!birthday";
const BIRTHDAYS_FILE = "./birthdays.json";

// Load or initialize the birthdays file
let birthdays = {};
if (fs.existsSync(BIRTHDAYS_FILE)) {
    birthdays = JSON.parse(fs.readFileSync(BIRTHDAYS_FILE, "utf8"));
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    // Schedule a daily check at 3 PM GMT
    cron.schedule('0 15 * * *', () => {
        checkAndAnnounceBirthdays();
    }, {
        scheduled: true,
        timezone: "GMT"
    });
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    const [command, action, arg, arg2] = message.content.trim().split(' ');

    if (action === "add") {
        // Validate and add birthday
        addBirthday(message, arg);
    } else if (action === "remove") {
        // Remove birthday
        removeBirthday(message);
    } 

    else if (action == "check") {
        // Check the user's birthday
        const user = message.mentions.users.first() || message.author;
        const userBirthday = birthdays[user.id];
        if (!userBirthday) {
            return message.reply(`<@${user.id}> (${user.username}) doesn't have a birthday set.`);
        }

        const [day, month, year] = userBirthday.date.split('/').map(num => parseInt(num));
        // Assuming the birthday year is relevant and you want to show it, use that year
        // time is 4:00:00 PM
        const birthdayDate = new Date(year, month - 1, day, 16, 0, 0);
        const birthdayTimestamp = Math.floor(birthdayDate.getTime() / 1000);

        const embed = new EmbedBuilder()
            .setTitle("Birthday Check 🎂")
            .setColor("#00FFFF")
            // Use the 'F' format to display the full date including the year they inputted
            .setDescription(`<@${user.id}> (${user.username}) has their birthday set on **<t:${birthdayTimestamp}:F>** (next birthday: <t:${getNextBirthdayTimestamp(day, month, year)}:R>)`);
        message.channel.send({ embeds: [embed] });
    }

    else if (action === "age") {
        // Check the user's age
        const user = message.mentions.users.first() || message.author;
        const userBirthday = birthdays[user.id];
        if (!userBirthday) {
            return message.reply(`<@${user.id}> (${user.username}) doesn't have a birthday set.`);
        }

        // Directly use the year, month, and day from the userBirthday object
        const year = userBirthday.year;
        const month = userBirthday.month;
        const day = userBirthday.day;
        const birthDate = new Date(year, month - 1, day); // JS months are 0-indexed
        const today = new Date();
        let age = today.getFullYear() - year;

        // Adjust age if the birthday hasn't occurred yet this year
        if (today.getMonth() < (month - 1) || (today.getMonth() === (month - 1) && today.getDate() < day)) {
            age--;
        }

        const embed = new EmbedBuilder()
            .setTitle("Birthday Age 🎂")
            .setColor("#00FFFF")
            .setDescription(`<@${user.id}> (${user.username}) is **${age}** years old.`);
        message.channel.send({ embeds: [embed] });
    }
    else if (action == "list") {
        Promise.all(Object.entries(birthdays).map(async ([userId, userData]) => {
            try {
                const [day, month, year] = userData.date.split('/').map(num => parseInt(num));
                const nextBirthdayTimestamp = getNextBirthdayTimestamp(day, month, year);
                // Format the message to include the Discord relative time format
                return `- <@${userId}> **<t:${nextBirthdayTimestamp}:F>** (<t:${nextBirthdayTimestamp}:R>)`;
            } catch (error) {
                console.error(`Could not process birthday for user: ${userId}`, error);
                return `<@${userId}> (Error processing birthday) - ${userData.date}`;
            }
        })).then(descriptions => {
            const embed = new EmbedBuilder()
                .setTitle("Birthday List 🎂")
                .setColor("#00FFFF")
                .setDescription(descriptions.join('\n\n'));
            message.channel.send({ embeds: [embed] });
        });
    }

    else if (action == "help") {
        const embed = new EmbedBuilder()
            .setTitle("Birthday Bot Help 🎂")
            .setColor("#00FFFF")
            .setDescription(`**Commands**:\n- **!birthday add DD/MM/YYYY**: Add your birthday.\n- **!birthday remove**: Remove your birthday.\n- **!birthday check**: Check a birthday.\n- **!birthday age**: Check someone's age. (might be up by a year if their birthday hasn't passed yet this year)\n- **!birthday list**: List all birthdays.`);
        message.channel.send({ embeds: [embed] });

    }
});

function addBirthday(message, date) {
    const dateRegex = /^(0?[1-9]|[12][0-9]|3[01])\/(0?[1-9]|1[012])\/\d{4}$/;

    if (!date || !dateRegex.test(date)) {
        return message.reply("Please provide a date in DD/MM/YYYY format.");
    }

    const [day, month, year] = date.split('/').map(num => parseInt(num, 10));
    const birthday = new Date(year, month - 1, day);

    if (isNaN(birthday.getTime())) {
        return message.reply("Invalid date. Please provide a valid date in DD/MM/YYYY format.");
    }

    // Check if the user already has a birthday set
    if (birthdays[message.author.id]) {
        return message.reply(`<@${message.author.id}> (${message.author.username}) You already have a birthday set, use **!birthday remove** to remove it then add a new one.`);
    }

    // Ensure the birthdays object is in scope
    birthdays[message.author.id] = { date: `${day}/${month}/${year}`, year, month, day, name: message.author.username };
    fs.writeFileSync(BIRTHDAYS_FILE, JSON.stringify(birthdays, null, 4));

    const embed = new EmbedBuilder()
        .setTitle("Birthday Added 🎉")
        .setColor("#34eb46")
        .setDescription(`<@${message.author.id}> (${message.author.username}) Your birthday on **${date}** has been successfully added!`);

    message.channel.send({ embeds: [embed] });
}

function removeBirthday(message) {
    if (!birthdays[message.author.id]) {
        return message.reply(`<@${message.author.id}> (${message.author.username}) You don't have a birthday set.`);
    }

    delete birthdays[message.author.id];
    fs.writeFileSync(BIRTHDAYS_FILE, JSON.stringify(birthdays, null, 4));

    const embed = new EmbedBuilder()
        .setTitle("Birthday Removed 🗑️")
        .setColor("#eb4034")
        .setDescription(`<@${message.author.id}> (${message.author.username}) Your birthday has been successfully removed.`);

    message.channel.send({ embeds: [embed] });
}


async function checkAndAnnounceBirthdays() {
    const today = new Date();
    const dateStr = `${today.getDate()}/${today.getMonth() + 1}`; // Format: DD/MM

    // Reload the birthdays from the file in case of any updates
    const updatedBirthdays = JSON.parse(fs.readFileSync(BIRTHDAYS_FILE, "utf8"));

    Object.entries(updatedBirthdays).forEach(async ([userId, userData]) => {
        if (userData.date.startsWith(dateStr)) {
            // Found a matching birthday, announce it
            const user = await client.users.fetch(userId).catch(console.error);
            if (!user) {
                console.log(`Could not fetch user with ID: ${userId}`);
                return;
            }

            const channel = await client.channels.fetch(process.env.BIRTHDAY_CHANNEL_ID).catch(console.error);
            if (!channel || channel.type !== ChannelType.GuildText) {
                console.log(`Could not find a valid text channel with ID: ${process.env.BIRTHDAY_CHANNEL_ID}`);
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle("🎉 Happy Birthday! 🎉")
                .setColor("#FFFF00")
                .setDescription(`Everyone, let's wish a very happy birthday to ${user.username}! 🎂🎈\nThey turned ${today.getFullYear() - userData.year} today!`);

            channel.send({ content: `<@${user.id}>`, embeds: [embed] });

            let role = await message.guild.roles.fetch(process.env.BIRTHDAY_ROLE_ID);
            user.roles.add(role);

            console.log(`Announced birthday for ${user.username}`);
        } else {
            console.log(`No birthdays found for today (${dateStr})`);
            // Check if anyone has the role and remove it
            let role = await message.guild.roles.fetch(process.env.BIRTHDAY_ROLE_ID);
            let members = role.members;
            members.forEach(member => {
                member.roles.remove(role);
            });

            console.log(`Removed birthday role from all members`);
        }
    });
}

function getNextBirthdayTimestamp(day, month, year) {
    // time is 4:00:00 PM
    const now = new Date();
    const thisYearBirthday = new Date(now.getFullYear(), month - 1, day, 16, 0, 0);
    const nextBirthday = now < thisYearBirthday ? thisYearBirthday : new Date(now.getFullYear() + 1, month - 1, day, 16, 0, 0);
    return Math.floor(nextBirthday.getTime() / 1000);
}


client.login(process.env.CLIENT_TOKEN);

process.on('unhandledRejection', (error) => {
    console.log(`Unhandled promise rejection: ${error}`);
    console.error(error);
});

process.on('uncaughtException', (error) => {
    console.log(`Uncaught exception: ${error}`);
    console.error(error);
});