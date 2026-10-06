const commandsPath = path.join(__dirname, "commands");

function getCommandFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    let files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files = files.concat(getCommandFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }

    return files;
}

const commandFiles = getCommandFiles(commandsPath);

for (const filePath of commandFiles) {
    const command = require(filePath);

    if (!command.data || !command.execute) {
        console.warn(`⚠️ Invalid command file: ${filePath}`);
        continue;
    }

    client.commands.set(command.data.name, command);
}
