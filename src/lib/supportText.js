// The task text managers receive: the client (if one was picked) on its own first line.
export function withClient(clientName, text) {
  return clientName ? `Client: ${clientName}\n${text}` : text;
}
