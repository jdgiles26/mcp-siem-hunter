<script src="https://gucci-lemonade.exe.xyz:8000/sdk/lemonade.js">
</script>
const ai = new LemonadeAI({
  apiKey: 'sk-lemonade-YOUR_KEY',
  baseURL: 'https://gucci-lemonade.exe.xyz:8000'
});

// Non-streaming
const res = await ai.chat([{ role: 'user', content: 'Hello!' }]);
console.log(res.choices[0].message.content);

// Streaming
for await (const text of ai.stream([{ role: 'user', content: 'Hello!' }])) {
  document.body.textContent += text;
}
</script>

