(function () {
    const boardEl = document.getElementById('board');
    const messageEl = document.getElementById('message');
    const checkBtn = document.getElementById('check-btn');
    const newGameBtn = document.getElementById('new-game-btn');

    let solution = JSON.parse(document.getElementById('solution-data').textContent);
    let cells = [];

    function renderBoard(puzzle) {
        boardEl.innerHTML = '';
        cells = [];
        for (let i = 0; i < 81; i++) {
            const input = document.createElement('input');
            input.className = 'cell';
            input.maxLength = 1;
            input.inputMode = 'numeric';

            const row = Math.floor(i / 9);
            const col = i % 9;
            if (col === 2 || col === 5) input.classList.add('border-right');
            if (row === 2 || row === 5) input.classList.add('border-bottom');

            if (puzzle[i] !== 0) {
                input.value = puzzle[i];
                input.disabled = true;
            } else {
                input.addEventListener('input', () => {
                    input.value = input.value.replace(/[^1-9]/g, '').slice(0, 1);
                    input.classList.remove('wrong');
                });
            }

            boardEl.appendChild(input);
            cells.push(input);
        }
        messageEl.textContent = '';
        messageEl.className = 'message';
    }

    function checkSolution() {
        let complete = true;
        let allCorrect = true;

        cells.forEach((cell, i) => {
            const value = cell.value ? parseInt(cell.value, 10) : 0;
            if (value === 0) complete = false;
            const correct = value === solution[i];
            cell.classList.toggle('wrong', value !== 0 && !correct);
            if (!correct) allCorrect = false;
        });

        if (!complete) {
            messageEl.textContent = '아직 빈 칸이 있습니다.';
            messageEl.className = 'message error';
        } else if (allCorrect) {
            messageEl.textContent = '정답입니다!';
            messageEl.className = 'message success';
        } else {
            messageEl.textContent = '틀린 칸이 있습니다.';
            messageEl.className = 'message error';
        }
    }

    async function newGame() {
        newGameBtn.disabled = true;
        messageEl.textContent = '새 퍼즐 생성 중...';
        messageEl.className = 'message';
        try {
            const res = await fetch('/api/new-puzzle/');
            const data = await res.json();
            solution = data.solution;
            renderBoard(data.puzzle);
        } finally {
            newGameBtn.disabled = false;
        }
    }

    checkBtn.addEventListener('click', checkSolution);
    newGameBtn.addEventListener('click', newGame);

    const initialPuzzle = JSON.parse(document.getElementById('puzzle-data').textContent);
    renderBoard(initialPuzzle);
})();
