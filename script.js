const API_URL = "http://127.0.0.1:8000";

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

let questions = [];
let currentQuestionIndex = 0;
let score = 0;
let timeLeft = 60;
let timerInterval;
let progress = 0;

let currentUser = { name: "Convidado", avatar: "🎓" };
let rankingData = [];

let waveChartInstance = null;
let doughnutChartInstance = null;
let topicBarChartInstance = null;

const categoryElem = document.getElementById('category');
const questionElem = document.getElementById('question');
const answerButtons = document.querySelectorAll('.answer');
const scoreElem = document.getElementById('score');
const highScoreElem = document.getElementById('high-score');
const timeElem = document.getElementById('time');
const progressElem = document.getElementById('progress');
const startButton = document.getElementById('start');

if (localStorage.getItem('highScore') && highScoreElem) {
    highScoreElem.innerText = localStorage.getItem('highScore');
}

function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.remove('active');
    });

    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add('active');
    }

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    if (viewId === 'view-home') document.querySelectorAll('.nav-btn')[0].classList.add('active');
    if (viewId === 'view-dashboard') {
        document.querySelectorAll('.nav-btn')[2].classList.add('active');
        renderDashboardCharts();
    }
    if (viewId === 'view-ia') {
        generateAIAnalysis();
    }
    if (viewId === 'view-ranking') {
        renderRankingTable();
    }
}

function openLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.add('active');
}

function closeLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.remove('active');
}

function handleUserSubmit(event) {
    event.preventDefault();
    const nameInput = document.getElementById('username').value.trim();
    const selectedAvatar = document.querySelector('input[name="avatar"]:checked').value;

    currentUser.name = nameInput || "Participante";
    currentUser.avatar = selectedAvatar;

    const nameDisp = document.getElementById('quiz-user-name');
    const avatarDisp = document.getElementById('quiz-user-avatar');
    if (nameDisp) nameDisp.innerText = currentUser.name;
    if (avatarDisp) avatarDisp.innerText = currentUser.avatar;

    closeLoginModal();
    switchView('view-quiz');
    startGame();
}

async function startGame() {
    score = 0;
    currentQuestionIndex = 0;
    if (scoreElem) scoreElem.innerText = score;
    if (startButton) startButton.disabled = true;
    timeLeft = 60;
    if (timeElem) timeElem.innerText = timeLeft;

    try {
        const resposta = await fetch(`${API_URL}/api/perguntas`);
        questions = await resposta.json();
    } catch (erro) {
        if (questionElem) questionElem.innerText = 'Não consegui carregar as perguntas.';
        if (startButton) startButton.disabled = false;
        return;
    }

    if (!questions || questions.length === 0) {
        if (questionElem) questionElem.innerText = 'Nenhuma pergunta disponível.';
        if (startButton) startButton.disabled = false;
        return;
    }

    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    loadQuestion();
}

function loadQuestion() {
    const questionData = questions[currentQuestionIndex];
    if (categoryElem) categoryElem.innerText = `Categoria: ${questionData.categoria}`;
    if (questionElem) questionElem.innerText = questionData.enunciado;

    const opcoes = [...questionData.opcoes];

    answerButtons.forEach((btn, index) => {
        btn.innerHTML = `<span>${opcoes[index]}</span>`;
        btn.classList.remove('correct', 'incorrect');
        btn.disabled = false;
    });

    progress = ((currentQuestionIndex + 1) / questions.length) * 100;
    if (progressElem) progressElem.style.width = `${progress}%`;
}

function updateTimer() {
    timeLeft--;
    if (timeElem) timeElem.innerText = timeLeft;
    if (timeLeft <= 0) {
        clearInterval(timerInterval);
        endGame();
    }
}

async function checkAnswer(selectedIndex) {
    answerButtons.forEach(btn => btn.disabled = true);

    const questionData = questions[currentQuestionIndex];
    const escolhida = answerButtons[selectedIndex].innerText;

    let resultado;
    try {
        const resposta = await fetch(`${API_URL}/api/responder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pergunta_id: questionData.id,
                resposta: escolhida
            })
        });
        resultado = await resposta.json();
    } catch (erro) {
        answerButtons.forEach(btn => btn.disabled = false);
        return;
    }

    if (resultado.acertou) {
        answerButtons[selectedIndex].classList.add('correct');
        score++;
    } else {
        answerButtons[selectedIndex].classList.add('incorrect');
        answerButtons.forEach(btn => {
            if (btn.innerText === resultado.correta) btn.classList.add('correct');
        });
    }

    if (scoreElem) scoreElem.innerText = score;
    setTimeout(nextQuestion, 1000);
}

function nextQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex < questions.length) {
        loadQuestion();
    } else {
        endGame();
    }
}

function endGame() {
    clearInterval(timerInterval);
    answerButtons.forEach(btn => btn.disabled = true);

    if (questionElem) questionElem.innerText = `Fim de jogo! Sua pontuação foi: ${score}`;
    if (categoryElem) categoryElem.innerText = "Parabéns!";

    const currentHighScore = Number(localStorage.getItem('highScore')) || 0;
    if (score > currentHighScore) {
        localStorage.setItem('highScore', score);
        if (highScoreElem) highScoreElem.innerText = score;
    }

    const usuarioId = localStorage.getItem('usuarioId');
    if (usuarioId) {
        fetch(`${API_URL}/api/pontuacao`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id: Number(usuarioId),
                pontuacao: score
            })
        }).catch(erro => {});
    }

    rankingData.unshift({
        name: currentUser.name,
        avatar: currentUser.avatar,
        score: score,
        total: questions.length || 4,
        status: "Ativo"
    });

    if (startButton) {
        startButton.disabled = false;
        startButton.innerText = "Jogar Novamente";
    }

    if (typeof confetti === 'function' && score > 0) {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
    }

    setTimeout(() => {
        switchView('view-dashboard');
    }, 1200);
}

function renderDashboardCharts() {
    const totalQ = questions.length || 4;
    const accuracyPct = totalQ > 0 ? Math.round((score / totalQ) * 100) : 0;

    const accElem = document.getElementById('dash-accuracy');
    if (accElem) accElem.innerText = `${accuracyPct}%`;

    if (waveChartInstance) waveChartInstance.destroy();
    if (doughnutChartInstance) doughnutChartInstance.destroy();
    if (topicBarChartInstance) topicBarChartInstance.destroy();

    const canvasWave = document.getElementById('waveChart');
    if (canvasWave) {
        const ctxWave = canvasWave.getContext('2d');
        waveChartInstance = new Chart(ctxWave, {
            type: 'line',
            data: {
                labels: ['Início', 'Fase 1', 'Fase 2', 'Pontuação Final'],
                datasets: [
                    {
                        label: 'Sua Pontuação',
                        data: [0, Math.round(score * 0.3), Math.round(score * 0.7), score],
                        borderColor: '#ffc815',
                        backgroundColor: 'rgba(255, 200, 21, 0.2)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Média Global',
                        data: [0, 1, 2, 3],
                        borderColor: '#3b82f6',
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#a7a4c8' } } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a7a4c8' } },
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a7a4c8' } }
                }
            }
        });
    }

    const canvasDoughnut = document.getElementById('doughnutChart');
    if (canvasDoughnut) {
        const ctxDoughnut = canvasDoughnut.getContext('2d');
        doughnutChartInstance = new Chart(ctxDoughnut, {
            type: 'doughnut',
            data: {
                labels: ['Acertos', 'Erros'],
                datasets: [{
                    data: [score, Math.max(0, totalQ - score)],
                    backgroundColor: ['#1ed760', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#a7a4c8' } } }
            }
        });
    }

    const canvasBar = document.getElementById('topicBarChart');
    if (canvasBar) {
        const ctxBar = canvasBar.getContext('2d');
        topicBarChartInstance = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: ['Sua Pontuação', 'Média Geral'],
                datasets: [{
                    label: 'Pontos',
                    data: [score, 2.5],
                    backgroundColor: ['#8b5cf6', '#3b82f6'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#a7a4c8' } },
                    x: { ticks: { color: '#a7a4c8' } }
                }
            }
        });
    }
}

function generateAIAnalysis() {
    const totalQ = questions.length || 4;
    const pct = totalQ > 0 ? (score / totalQ) * 100 : 0;

    const heading = document.getElementById('ai-performance-heading');
    const summary = document.getElementById('ai-performance-summary');
    const level = document.getElementById('ai-level');
    const strong = document.getElementById('ai-strong-point');
    const focus = document.getElementById('ai-focus-area');
    const recList = document.getElementById('ai-rec-list');

    if (!heading) return;

    if (pct >= 80) {
        heading.innerText = "Excelente Domínio em ODS 4!";
        summary.innerText = "Sua pontuação no banco de dados demonstra elevado conhecimento das metas globais da ONU para Educação de Qualidade.";
        level.innerText = "Especialista";
        strong.innerText = "Métricas & Metas";
        focus.innerText = "Disseminação";
        recList.innerHTML = `
            <li><i class="fa-solid fa-check"></i> Continue acompanhando as diretrizes da ODS 4 até 2030.</li>
            <li><i class="fa-solid fa-check"></i> Compartilhe o conhecimento com outros participantes.</li>
        `;
    } else if (pct >= 40) {
        heading.innerText = "Bom Desempenho no Diagnóstico!";
        summary.innerText = "Você demonstra compreensão intermediária sobre a ODS 4. Continue praticando para atingir a pontuação máxima.";
        level.innerText = "Intermediário";
        strong.innerText = "Conceitos de Inclusão";
        focus.innerText = "Revisão Geral";
        recList.innerHTML = `
            <li><i class="fa-solid fa-check"></i> Estude os índices de déficit educacional global (263M fora da escola).</li>
            <li><i class="fa-solid fa-check"></i> Jogue novamente para superar seu recorde pessoal.</li>
        `;
    } else {
        heading.innerText = "Oportunidade de Aprendizado";
        summary.innerText = "A ODS 4 visa assegurar a educação inclusiva e equitativa de qualidade. Continue tentando!";
        level.innerText = "Iniciante";
        strong.innerText = "Engajamento";
        focus.innerText = "Estatísticas ONU";
        recList.innerHTML = `
            <li><i class="fa-solid fa-check"></i> Leia as informações na página inicial para fixar o conteúdo.</li>
            <li><i class="fa-solid fa-check"></i> Inicie uma nova rodada no Quiz para acumular pontos no servidor.</li>
        `;
    }
}

function renderRankingTable(filterText = '') {
    const tbody = document.getElementById('ranking-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = rankingData.filter(r => r.name.toLowerCase().includes(filterText.toLowerCase()));

    filtered.forEach((row, idx) => {
        const tr = document.createElement('tr');
        if (row.name === currentUser.name) tr.className = 'highlight-user';

        let badge = '-';
        if (idx === 0) badge = '🥇 Ouro';
        else if (idx === 1) badge = '🥈 Prata';
        else if (idx === 2) badge = '🥉 Bronze';

        tr.innerHTML = `
            <td>#${idx + 1}</td>
            <td>${row.avatar} ${row.name}</td>
            <td>${row.score} / ${row.total}</td>
            <td>${row.status}</td>
            <td>${badge}</td>
        `;
        tbody.appendChild(tr);
    });
}

function filterRanking() {
    const query = document.getElementById('ranking-search').value;
    renderRankingTable(query);
}

document.addEventListener('DOMContentLoaded', () => {
    switchView('view-home');
});