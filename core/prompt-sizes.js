const fs = require("fs");
const path = require("path");

function messageContentLength(content) {
  if (content == null) return 0;

  if (typeof content === "string") return content.length;

  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (!part || typeof part !== "object") return sum;

      if (part.type === "text" && typeof part.text === "string") {
        return sum + part.text.length;
      }

      return sum;
    }, 0);
  }

  return String(content).length;
}

/**
 * Mede caracteres do campo `input` de responses.create (string ou mensagens).
 */
function measureChatInput(input) {
  if (input == null) {
    return { total_prompt_chars: 0 };
  }

  if (typeof input === "string") {
    const n = input.length;
    return {
      total_prompt_chars: n,
      user_chars: n,
    };
  }

  if (Array.isArray(input)) {
    let system_chars = 0;
    let user_chars = 0;

    for (const msg of input) {
      if (!msg || typeof msg !== "object") continue;

      const len = messageContentLength(msg.content);

      if (msg.role === "system") {
        system_chars += len;
      } else {
        user_chars += len;
      }
    }

    return {
      system_chars,
      user_chars,
      total_prompt_chars: system_chars + user_chars,
    };
  }

  return { total_prompt_chars: 0 };
}

/**
 * Acrescenta entrada em `.IA/outputs/<run-id>/prompt-sizes.json` (merge por etapa).
 */
function writePromptSizeRecord(outputDir, step, record) {
  if (outputDir == null || outputDir === "") return;

  let dir;

  try {
    dir = path.resolve(outputDir);
  } catch (_) {
    return;
  }

  try {
    if (!fs.existsSync(dir)) return;
  } catch (_) {
    return;
  }

  const filePath = path.join(dir, "prompt-sizes.json");
  let data = {};

  if (fs.existsSync(filePath)) {
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (_) {
      data = {};
    }
  }

  data[step] = {
    ...record,
    recorded_at: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (_) {
    /* não falhar o pipeline */
  }
}

module.exports = {
  measureChatInput,
  writePromptSizeRecord,
};
