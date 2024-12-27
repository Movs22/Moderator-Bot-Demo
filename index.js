const token = require("./config.json").token;

const { Client, IntentsBitField, ContextMenuCommandBuilder, REST, Routes, ApplicationCommandType, PermissionsBitField, ModalBuilder, Component, ActionRowBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require("discord.js")

const rest = new REST().setToken(token);

let client = new Client({intents: [IntentsBitField.Flags.MessageContent]})

let commands = []

const remove = new ContextMenuCommandBuilder()
.setName("Remove Message")
.setType(ApplicationCommandType.Message)

const mod = new ContextMenuCommandBuilder()
.setName("Moderate Message")
.setType(ApplicationCommandType.Message)
//.setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)

const removeModal = new ModalBuilder()
.setTitle("Remove a message")
.setCustomId("rm")
.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Reason for deletion").setStyle(TextInputStyle.Paragraph).setPlaceholder("Not SCR gameplay."))
)

const modModal = new ModalBuilder()
.setTitle("Moderate a message")
.setCustomId("mod")
.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("action").setLabel("Moderative action").setStyle(TextInputStyle.Short).setPlaceholder("timeout 1h | warn | kick")),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Reason for moderation").setStyle(TextInputStyle.Paragraph).setPlaceholder("Sending NSFW content."))
)

commands.push(remove.toJSON())
commands.push(mod.toJSON())

let botCommands;
let logsChannel;

let modMessages = {};
let modIntervals = {};

client.on("ready", async () => {
    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands },
    );
    botCommands = await client.channels.fetch("1322008400699195442")
    logsChannel = await client.channels.fetch("1322008414422958201")
    console.log(`Registered slash ${commands.length} commands!`)
})

client.on("interactionCreate", async (interaction) => {
    if(interaction.isContextMenuCommand()) {
        if(interaction.commandName === "Remove Message") {
            let msg = interaction.targetMessage;
            // Fixes "ChannelNotCached"
            if(!["1322008352397463644","1322017704663580744"].includes(msg.channelId)) return interaction.reply({ content: ":x: You can only use the Remove Messages command for messages sent in <#1322008352397463644>, <#1322017704663580744> and #gameplay.", ephemeral: true})
            if(modMessages[msg.id]) return interaction.reply({ content: ":x: Another supervisor is already taking care of this message.", ephemeral: true })
            if(!client.channels.cache.get(msg.channelId)) await client.channels.fetch(msg.channelId);            
            removeModal.setCustomId("rm-" + msg.id)
            interaction.showModal(removeModal);
            modMessages[msg.id] = interaction.user.id;
            interaction.awaitModalSubmit({ filter: (i) => i.customId === "rm-" + msg.id, time: 60_000 }).then(response => {
                response.deferReply({ content: "Processing...", ephemeral: true })
                clearInterval(modIntervals[response.customId.split("-")[1]])
                modIntervals[response.customId.split("-")[1]] = undefined;
                modMessages[response.customId.split("-")[1]] = undefined;

                let reason = response.fields.getTextInputValue("reason");

                let message = interaction.targetMessage;
                message.author.send(":warning: **Message removed.**\nReason: " + reason)
                let att = message.attachments.length;
                message.delete().then(r => {
                    let e = new EmbedBuilder()
                    .setAuthor({ name: r.author.username, iconURL: r.author.avatarURL()})
                    .setDescription("**Message sent by <@" + r.author.id + "> deleted in <#" + r.channelId + "> by <@" + response.user.id + "> [Jump to message](https://discord.com/channels/1286100228008574986/" + r.channelId + "/" + r.id + ")** \n\n" + r.content).setColor("DarkRed")
                    .setFooter({ text: "Author: " + r.author.id + " | Message ID: " + r.id })
                    .setTimestamp()
                    logsChannel.send({ embeds: [e]}).then(msg => {
                        botCommands.send(`Evidence: https://discord.com/channels/1286100228008574986/${msg.channelId}/${msg.id}`)
                    })
                })
                interaction.editReply({ content: `> ✅ | Message with ${att} attachment${att !== 1 ? "s" : ""} deleted successfully for \`${reason}\`.`})
            }).catch(() => {
                console.log("FAILED")
            })
            // Times out the modal if a supervisor fails to respond to it within 60 seconds (1 minute)
            i = setTimeout(() => {
                botCommands.send(":x: | <@" + modMessages[msg.id] + ">, your form timed out.")
                modMessages[msg.id] = undefined;
            }, 60 * 1000)
            modIntervals[msg.id] = i;
        } else if(interaction.commandName === "Moderate Message") {
            let msg = interaction.targetMessage;
            // Fixes "ChannelNotCached"
            if(modMessages[msg.id]) return interaction.reply({ content: ":x: Another supervisor is already moderating this message.", ephemeral: true })
            if(!client.channels.cache.get(msg.channelId)) await client.channels.fetch(msg.channelId);
            modModal.setCustomId("mod-" + msg.id)
            interaction.showModal(modModal);
            modMessages[msg.id] = interaction.user.id;
            interaction.awaitModalSubmit({ filter: (i) => i.customId === "mod-" + msg.id, time: 60_000 }).then(async response => {
                await response.deferReply({ content: "Processing...", ephemeral: true })
                clearInterval(modIntervals[response.customId.split("-")[1]])
                modIntervals[response.customId.split("-")[1]] = undefined;
                
                let modAction = response.fields.getTextInputValue("action");
                if(!validate(modAction)) return interaction.editReply({content: ":x: Invalid moderative action. It should either be `kick`, `warn` or `timeout Xh`", ephemeral: true})
                let reason = response.fields.getTextInputValue("reason");
                let message = interaction.targetMessage;
                let modActions = response.fields.getTextInputValue("action").split(" ");

                let action = modActions[0];
                switch(action) {
                    case "kick":
                        botCommands.send("> ✅ | Kick issued successfully for " + message.author.username + " (`" + reason + "`) with the case ID `MOD-WXXXXXXX`.")
                        // kick command logic
                        break;
                    case "timeout":
                        duration = modActions[1]
                        char = duration[duration.length - 1]
                        dur = parseInt(duration.substring(0, duration.length - 1))
                        if(char === "h") char = "hour" + (dur === 1 ? "" : "s");
                        if(char === "m") char = "minute" + (dur === 1 ? "" : "s");
                        if(char === "s") char = "second" + (dur === 1 ? "" : "s");
                        botCommands.send("> ✅ | Timedout with the duration of " + dur + " " + char + " issued successfully for " + message.author.username + " (`" + reason + "`) with the case ID `MOD-WXXXXXXX`.")
                        // timeout command logic
                        break;
                    case "warn":
                        botCommands.send("> ✅ | Warning issued successfully for " + message.author.username + " (`" + reason + "`) with the case ID `MOD-WXXXXXXX`.")
                        // warn command logic
                        break;
                    default:
                        botCommands.send(":x: | <@" + modMessages[msg.id] + ">, failed to run " + action)
                        break;
                }
                message.delete().then(r => {
                    let e = new EmbedBuilder()
                    .setAuthor({ name: r.author.username, iconURL: r.author.avatarURL()})
                    .setDescription("**Message sent by <@" + r.author.id + "> deleted in <#" + r.channelId + "> by <@" + response.user.id + "> [Jump to message](https://discord.com/channels/1286100228008574986/" + r.channelId + "/" + r.id + ")** \n\n" + r.content)
                    .setColor("DarkRed")
                    .setFooter({ text: "Author: " + r.author.id + " | Message ID: " + r.id })
                    .setTimestamp()
                    logsChannel.send({ embeds: [e]}).then(msg => {
                        botCommands.send(`Evidence: https://discord.com/channels/1286100228008574986/${msg.channelId}/${msg.id}`)
                    })
                })
                response.editReply("✅ Success! Check <#" + botCommands.id + ">.")
                modMessages[response.customId.split("-")[1]] = undefined;
                
            }).catch((err) => {
                console.log(err)
                console.log("FAILED")
            })
            i = setTimeout(() => {
                botCommands.send(":x: | <@" + modMessages[msg.id] + ">, your form timed out.")
                modMessages[msg.id] = undefined;
            }, 60 * 1000)
            modIntervals[msg.id] = i;
        }
    }
})

function validate(action) {
    if(action === "warn" || action === "kick") return true;
    if(action.startsWith("timeout") && validateTime(action.split(" ")[1])) return true;
    return false;
}

validateTime("1h")
validateTime("69h")
validateTime("5m")

function validateTime(t) {
    let time = t.substring(0, t.length - 1)
    let char = t[t.length - 1]
    if(["s","m","h"].includes(char) && !isNaN(time) && isFinite(time) && parseInt(time) > 0) return true;
    return false;
}

client.login(token)