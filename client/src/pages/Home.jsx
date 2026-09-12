import { useEffect, useState } from "react";
import { getHealth } from "../services/api.js";

function Home() {
  const [status, setStatus] = useState("Checking backend status...");

  useEffect(() => {
    // Ignore late responses after the component unmounts.
    let isActive = true;

    getHealth()
      .then((data) => {
        if (isActive) setStatus(data.message);
      })
      .catch((error) => {
        if (isActive) setStatus(error.message);
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <main>
      <h1>ResolveAI - AI Powered Customer Support</h1>
      <p>Backend status: {status}</p>
    </main>
  );
}

export default Home;
