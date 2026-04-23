import { invoke } from "@tauri-apps/api/core";

export async function sendSerialCommand(cmd: string): Promise<void> {
  await invoke("send_command", { cmd });
}