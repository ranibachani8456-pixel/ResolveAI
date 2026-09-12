import app from "./app.js";
import { env } from "./config/env.js";

// This file only starts the server; Express configuration lives in app.js.
app.listen(env.port, (error) => {
  if (error) {
    console.error(`Unable to start ResolveAI API: ${error.message}`);
    process.exit(1);
  }

  console.log(`ResolveAI API listening on port ${env.port}`);
});
