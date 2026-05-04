import { useState, useEffect } from "react";
import Sprite from "./Sprite";

function App() {
  const [commentary, setCommentary] = useState("");

  useEffect(() => {
    if (!window.api?.onCommentary) return;
    
    window.api.onCommentary((text) => {
      setCommentary(text);
      setTimeout(() => setCommentary(""), 4000);
    });
  }, []);

  return (
    <div className="buddy-container">
      <Sprite name="egg" />
      {commentary && <div className="buddy-commentary">{commentary}</div>}
    </div>
  );
}

export default App;
