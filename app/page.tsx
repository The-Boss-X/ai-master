// page.tsx (with grid outline)

"use client";

import { useState } from "react";

const winningCombinations = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export default function Home() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);

  const handleClick = (index: number) => {
    if (winner || board[index]) return;

    const newBoard = [...board];
    newBoard[index] = xIsNext ? "X" : "O";
    setBoard(newBoard);
    setXIsNext(!xIsNext);

    const checkWinner = () => {
      for (const combination of winningCombinations) {
        const [a, b, c] = combination;
        if (
          newBoard[a] &&
          newBoard[a] === newBoard[b] &&
          newBoard[a] === newBoard[c]
        ) {
          setWinner(newBoard[a]);
          return;
        }
      }
      if (!newBoard.includes(null)) {
        setWinner("Draw");
      }
    };

    checkWinner();
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setXIsNext(true);
    setWinner(null);
  };

  const getStatus = () => {
    if (winner) {
      return winner === "Draw" ? "Draw!" : `Winner: ${winner}`;
    } else {
      return `Next player: ${xIsNext ? "X" : "O"}`;
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Tic Tac Toe</h1>
      <div className="mb-4">{getStatus()}</div>
      <div className="grid grid-cols-3 gap-2 border-2 border-black"> {/* Added border here */}
        {board.map((value, index) => (
          <button
            key={index}
            className={`w-20 h-20 border border-black text-4xl font-bold ${
              value === "X" ? "text-blue-500" : "text-red-500"
            }`}
            onClick={() => handleClick(index)}
          >
            {value}
          </button>
        ))}
      </div>
      {winner && (
        <button
          className="mt-8 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={resetGame}
        >
          Play Again
        </button>
      )}
    </main>
  );
}