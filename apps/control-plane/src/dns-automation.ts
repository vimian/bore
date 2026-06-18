import { spawn } from "node:child_process";

const DNS_COMMAND_TIMEOUT_MS = 60_000;
const DNS_COMMAND_FORCE_KILL_MS = 5_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT";

export interface DnsRecord {
  name: string;
  type: DnsRecordType;
  value: string;
  ttl: number;
}

export class DnsAutomation {
  constructor(private readonly command?: string) {}

  get enabled(): boolean {
    return Boolean(this.command);
  }

  async upsertRecord(record: DnsRecord): Promise<void> {
    await this.run("UPSERT", record);
  }

  async deleteRecord(record: DnsRecord): Promise<void> {
    await this.run("DELETE", record);
  }

  private async run(action: "UPSERT" | "DELETE", record: DnsRecord): Promise<void> {
    if (!this.command) {
      throw new Error("DNS automation is not configured");
    }

    const command = this.command;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, {
        shell: true,
        windowsHide: true,
        stdio: "pipe",
        env: {
          ...process.env,
          BORE_DNS_ACTION: action,
          BORE_DNS_NAME: record.name,
          BORE_DNS_TYPE: record.type,
          BORE_DNS_VALUE: record.value,
          BORE_DNS_TTL: String(record.ttl),
        },
      });
      child.stdin.end();
      const output: Buffer[] = [];
      let timedOut = false;
      let forceKill: NodeJS.Timeout | undefined;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKill = setTimeout(() => {
          child.kill("SIGKILL");
        }, DNS_COMMAND_FORCE_KILL_MS);
      }, DNS_COMMAND_TIMEOUT_MS);

      const collect = (chunk: Buffer) => {
        const currentSize = output.reduce((total, item) => total + item.byteLength, 0);

        if (currentSize < MAX_OUTPUT_BYTES) {
          output.push(chunk);
        }
      };
      const buildError = (message: string) => {
        const details = Buffer.concat(output).toString("utf8").trim();
        return new Error(details ? `${message}: ${details}` : message);
      };

      child.stdout?.on("data", collect);
      child.stderr?.on("data", collect);
      child.on("error", (error: Error) => {
        clearTimeout(timeout);
        clearTimeout(forceKill);
        reject(error);
      });
      child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
        clearTimeout(timeout);
        clearTimeout(forceKill);

        if (timedOut) {
          reject(buildError("DNS command timed out"));
          return;
        }

        if (signal) {
          reject(buildError(`DNS command exited on signal ${signal}`));
          return;
        }

        if (code && code !== 0) {
          reject(buildError(`DNS command exited with code ${code}`));
          return;
        }

        resolve();
      });
    });
  }
}
