const fs = require("fs");
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    StreamType,
    NoSubscriberBehavior,
    entersState
} = require("@discordjs/voice");
const { spawn } = require("child_process");

const YTDLP_PATH = process.env.YTDLP_PATH || "/usr/local/bin/yt-dlp";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "/usr/bin/ffmpeg";
const YOUTUBE_COOKIES = process.env.YOUTUBE_COOKIES ||
    "/home/bartenderadmin/Bartender/cookies/youtube.txt";
const NODE_PATH = process.env.YTDLP_NODE_PATH ||
    "/home/bartenderadmin/.nvm/versions/node/v24.21.0/bin/node";

function getYtDlpCommonArgs() {
    const args = ["--no-warnings", "--no-playlist"];

    if (fs.existsSync(YOUTUBE_COOKIES)) {
        args.push("--cookies", YOUTUBE_COOKIES);
    }

    if (fs.existsSync(NODE_PATH)) {
        args.push("--js-runtimes", `node:${NODE_PATH}`);
    }

    return args;
}

class GuildMusic {
    constructor(guildId) {
        this.guildId = guildId;
        this.connection = null;
        this.queue = [];
        this.current = null;
        this.volume = 1;
        this.loop = false;
        this.textChannel = null;
        this.ytDlpProcess = null;
        this.ffmpegProcess = null;
        this.currentResource = null;
        this.startingPlayback = false;
        this.disconnecting = false;

        this.player = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
        });

        this.player.on(AudioPlayerStatus.Idle, () => {
            void this.handleIdle();
        });

        this.player.on("error", error => {
            console.error(`[Music:${this.guildId}] Audio player error:`, error);
            this.killProcesses();
            this.player.stop(true);
        });
    }

    async connect(channel) {
        if (!channel?.id || !channel?.guild) {
            throw new Error("A valid Discord voice channel is required.");
        }

        const usable = this.connection &&
            this.connection.state.status !== VoiceConnectionStatus.Destroyed;

        if (usable && this.connection.joinConfig.channelId === channel.id) {
            await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
            return this.connection;
        }

        if (usable) {
            this.connection.destroy();
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false
        });

        this.connection = connection;
        connection.subscribe(this.player);

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
            return connection;
        } catch (error) {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
            if (this.connection === connection) {
                this.connection = null;
            }
            throw new Error(`Could not connect to the voice channel: ${error?.message || error}`);
        }
    }

    async disconnect() {
        this.disconnecting = true;
        this.queue = [];
        this.current = null;
        this.textChannel = null;
        this.killProcesses();
        this.currentResource = null;
        this.player.stop(true);

        if (this.connection?.state.status !== VoiceConnectionStatus.Destroyed) {
            this.connection?.destroy();
        }

        this.connection = null;
        this.disconnecting = false;
    }

    async add(track) {
        if (!track?.url) {
            throw new Error("Cannot add a track without a URL.");
        }

        this.queue.push(track);

        if (!this.current && this.player.state.status === AudioPlayerStatus.Idle) {
            return this.playNext();
        }

        return false;
    }

    async handleIdle() {
        this.killProcesses();
        this.currentResource = null;

        if (this.disconnecting) {
            return;
        }

        const completed = this.current;
        this.current = null;

        if (this.loop && completed) {
            this.queue.unshift(completed);
        }

        await this.playNext();
    }

    async playNext() {
        if (this.startingPlayback || this.current) {
            return false;
        }

        const nextTrack = this.queue.shift();
        if (!nextTrack) {
            return false;
        }

        this.startingPlayback = true;
        this.current = nextTrack;

        try {
            console.log("YT-DLP ARGS:", args);
            const ytDlp = spawn(
                YTDLP_PATH,
                [
                    ...getYtDlpCommonArgs(),
                    "-f", "bestaudio/best",
                    "-o", "-",
                    nextTrack.url
                ],
                { stdio: ["ignore", "pipe", "pipe"] }
            );

            const ffmpeg = spawn(
                FFMPEG_PATH,
                [
                    "-hide_banner", "-loglevel", "error",
                    "-i", "pipe:0",
                    "-vn", "-acodec", "pcm_s16le",
                    "-f", "s16le", "-ar", "48000", "-ac", "2",
                    "pipe:1"
                ],
                { stdio: ["pipe", "pipe", "pipe"] }
            );

            this.ytDlpProcess = ytDlp;
            this.ffmpegProcess = ffmpeg;
            ytDlp.stdout.pipe(ffmpeg.stdin);

            let ytDlpError = "";
            ytDlp.stderr.setEncoding("utf8");
            ytDlp.stderr.on("data", chunk => {
                ytDlpError += chunk;
                if (ytDlpError.length > 20_000) {
                    ytDlpError = ytDlpError.slice(-20_000);
                }
            });

            ffmpeg.stderr.setEncoding("utf8");
            ffmpeg.stderr.on("data", chunk => {
                const message = chunk.trim();
                if (message) {
                    console.error(`[Music:${this.guildId}] FFmpeg:`, message);
                }
            });

            ytDlp.once("error", error => {
                console.error(`[Music:${this.guildId}] Could not start yt-dlp:`, error);
                if (this.current === nextTrack) {
                    this.player.stop(true);
                }
            });

            ytDlp.once("close", code => {
                if (this.ytDlpProcess === ytDlp) {
                    this.ytDlpProcess = null;
                }
                if (code !== 0 && this.current === nextTrack) {
                    console.error(
                        `[Music:${this.guildId}] yt-dlp failed (${code}):`,
                        ytDlpError.trim() || "No error details returned."
                    );
                    this.player.stop(true);
                }
            });

            ffmpeg.once("error", error => {
                console.error(`[Music:${this.guildId}] Could not start FFmpeg:`, error);
                if (this.current === nextTrack) {
                    this.player.stop(true);
                }
            });

            ffmpeg.once("close", code => {
                if (this.ffmpegProcess === ffmpeg) {
                    this.ffmpegProcess = null;
                }
                if (code !== 0 && code !== null && this.current === nextTrack) {
                    console.error(`[Music:${this.guildId}] FFmpeg exited with code ${code}`);
                }
            });

            const resource = createAudioResource(ffmpeg.stdout, {
                inputType: StreamType.Raw,
                inlineVolume: true,
                metadata: nextTrack
            });

            resource.volume.setVolume(this.volume);
            this.currentResource = resource;
            this.player.play(resource);
            return true;
        } catch (error) {
            this.killProcesses();
            this.currentResource = null;
            this.current = null;
            throw error;
        } finally {
            this.startingPlayback = false;
        }
    }

    killProcesses() {
        const ytDlp = this.ytDlpProcess;
        const ffmpeg = this.ffmpegProcess;
        this.ytDlpProcess = null;
        this.ffmpegProcess = null;

        for (const process of [ytDlp, ffmpeg]) {
            if (process && process.exitCode === null && !process.killed) {
                process.kill("SIGKILL");
            }
        }
    }

    pause() { return this.player.pause(); }
    resume() { return this.player.unpause(); }

    skip() {
        if (!this.current) return false;
        this.current = null;
        this.killProcesses();
        return this.player.stop(true);
    }

    stop() {
        this.queue = [];
        this.current = null;
        this.killProcesses();
        this.currentResource = null;
        return this.player.stop(true);
    }

    setVolume(volume) {
        const parsed = Number(volume);
        if (!Number.isFinite(parsed)) {
            throw new TypeError("Volume must be a valid number.");
        }
        this.volume = Math.max(0, Math.min(2, parsed));
        this.currentResource?.volume?.setVolume(this.volume);
        return this.volume;
    }

    toggleLoop() {
        this.loop = !this.loop;
        return this.loop;
    }

    shuffle() {
        for (let index = this.queue.length - 1; index > 0; index--) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [this.queue[index], this.queue[randomIndex]] =
                [this.queue[randomIndex], this.queue[index]];
        }
        return this.queue;
    }

    clearQueue() {
        const count = this.queue.length;
        this.queue = [];
        return count;
    }

    getData() {
        const positionMs = this.currentResource?.playbackDuration ?? 0;
        return {
            queue: [...this.queue],
            current: this.current,
            position: this.current ? positionMs / 1000 : 0,
            volume: this.volume,
            loop: this.loop,
            textChannel: this.textChannel,
            connection: this.connection,
            playerStatus: this.player.state.status
        };
    }
}

class MusicManager {
    constructor() { this.guilds = new Map(); }

    get(guildId) {
        if (!guildId) throw new Error("A guild ID is required.");
        if (!this.guilds.has(guildId)) {
            this.guilds.set(guildId, new GuildMusic(guildId));
        }
        return this.guilds.get(guildId);
    }

    getExisting(guildId) { return this.guilds.get(guildId) || null; }

    getGuildData(guildId) {
        return this.getExisting(guildId)?.getData() || {
            queue: [], current: null, position: 0, volume: 1,
            loop: false, textChannel: null, connection: null,
            playerStatus: AudioPlayerStatus.Idle
        };
    }

    getGuildDataPublic(guildId) { return this.getGuildData(guildId); }
    connect(guildId, channel) { return this.get(guildId).connect(channel); }
    setTextChannel(guildId, channel) { this.get(guildId).textChannel = channel; }
    add(guildId, track) { return this.get(guildId).add(track); }
    playNext(guildId) { return this.get(guildId).playNext(); }
    pause(guildId) { return this.get(guildId).pause(); }
    resume(guildId) { return this.get(guildId).resume(); }
    skip(guildId) { return this.get(guildId).skip(); }
    stop(guildId) { return this.get(guildId).stop(); }
    setVolume(guildId, volume) { return this.get(guildId).setVolume(volume); }
    toggleLoop(guildId) { return this.get(guildId).toggleLoop(); }
    shuffle(guildId) { return this.get(guildId).shuffle(); }
    clearQueue(guildId) { return this.get(guildId).clearQueue(); }

    async disconnect(guildId) {
        const music = this.getExisting(guildId);
        if (!music) return;
        await music.disconnect();
        this.guilds.delete(guildId);
    }

    async remove(guildId) { await this.disconnect(guildId); }
}

const musicManager = new MusicManager();
musicManager.getYtDlpCommonArgs = getYtDlpCommonArgs;
musicManager.YTDLP_PATH = YTDLP_PATH;
module.exports = musicManager;
