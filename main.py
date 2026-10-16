from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import (
    get_db, Usuario, Pergunta, Alternativa, Materia,
    Tentativa, Resposta
)
import random

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# SCHEMAS
# =========================
class UsuarioCreate(BaseModel):
    nome: str


class RespostaCreate(BaseModel):
    pergunta_id: int
    resposta: str
    tempo_gasto: Optional[int] = None
    tentativa_id: Optional[int] = None


class PontuacaoCreate(BaseModel):
    usuario_id: int
    pontuacao: int
    tempo_total: Optional[int] = None
    tentativa_id: Optional[int] = None


class TentativaCreate(BaseModel):
    usuario_id: int


# =========================
# PARTE 1 - CADASTRO
# =========================
@app.get("/")
def home():
    return {"mensagem": "API do Quiz ODS 4 funcionando!"}


@app.post("/api/usuarios")
def criar_usuario(dados: UsuarioCreate, db: Session = Depends(get_db)):
    nome = dados.nome.strip()

    if not nome:
        raise HTTPException(status_code=400, detail={"erro": "Nome não pode ser vazio"})

    novo = Usuario(nome=nome, pontuacao=0)
    db.add(novo)
    db.commit()
    db.refresh(novo)

    return {
        "id": novo.id,
        "nome": novo.nome
    }


@app.get("/api/usuarios")
def listar_usuarios(db: Session = Depends(get_db)):
    usuarios = db.query(Usuario).all()
    return [
        {
            "id": u.id,
            "nome": u.nome,
            "pontuacao": u.pontuacao
        }
        for u in usuarios
    ]


# =========================
# INICIAR TENTATIVA (opcional, mas recomendado)
# =========================
@app.post("/api/tentativas")
def iniciar_tentativa(dados: TentativaCreate, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.id == dados.usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail={"erro": "Usuário não encontrado"})

    tentativa = Tentativa(
        id_usuario=usuario.id,
        pontuacao_total=0,
        iniciado_em=datetime.now()
    )
    db.add(tentativa)
    db.commit()
    db.refresh(tentativa)

    return {
        "tentativa_id": tentativa.id,
        "usuario_id": usuario.id
    }


# =========================
# PARTE 2 - PERGUNTAS
# =========================
@app.get("/api/perguntas")
def listar_perguntas(db: Session = Depends(get_db)):
    """
    Retorna até 10 perguntas (2 por matéria), aleatórias,
    com alternativas embaralhadas e SEM a resposta correta.
    """
    materias = db.query(Materia).all()
    perguntas_selecionadas = []

    for materia in materias:
        perguntas = (
            db.query(Pergunta)
            .filter(Pergunta.id_materia == materia.id)
            .all()
        )
        if not perguntas:
            continue

        escolhidas = random.sample(perguntas, min(2, len(perguntas)))
        perguntas_selecionadas.extend(escolhidas)

    random.shuffle(perguntas_selecionadas)

    resultado = []
    for p in perguntas_selecionadas:
        alternativas = (
            db.query(Alternativa)
            .filter(Alternativa.id_pergunta == p.id)
            .all()
        )

        opcoes = [a.texto for a in alternativas]
        random.shuffle(opcoes)

        resultado.append({
            "id": p.id,
            "categoria": p.materia.nome if p.materia else "Geral",
            "enunciado": p.enunciado,
            "dificuldade": p.dificuldade,
            "pontos": p.pontos,
            "opcoes": opcoes
        })

    return resultado


# =========================
# RESPONDER (acertos, erros, tempo)
# =========================
@app.post("/api/responder")
def responder(dados: RespostaCreate, db: Session = Depends(get_db)):
    pergunta = db.query(Pergunta).filter(Pergunta.id == dados.pergunta_id).first()
    if not pergunta:
        raise HTTPException(status_code=404, detail={"erro": "Pergunta não encontrada"})

    # alternativa escolhida pelo texto
    alternativa_escolhida = (
        db.query(Alternativa)
        .filter(
            Alternativa.id_pergunta == dados.pergunta_id,
            Alternativa.texto == dados.resposta.strip()
        )
        .first()
    )

    # alternativa correta
    alternativa_correta = (
        db.query(Alternativa)
        .filter(
            Alternativa.id_pergunta == dados.pergunta_id,
            Alternativa.correta == True
        )
        .first()
    )

    if not alternativa_correta:
        raise HTTPException(status_code=500, detail={"erro": "Alternativa correta não encontrada"})

    acertou = False
    pontos_ganhos = 0

    if alternativa_escolhida and alternativa_escolhida.correta:
        acertou = True
        pontos_ganhos = pergunta.pontos

    # Se veio tentativa_id, salva a resposta no banco
    if dados.tentativa_id and alternativa_escolhida:
        tentativa = db.query(Tentativa).filter(Tentativa.id == dados.tentativa_id).first()
        if tentativa:
            nova_resposta = Resposta(
                id_tentativa=tentativa.id,
                id_pergunta=pergunta.id,
                id_alternativa=alternativa_escolhida.id,
                acertou=acertou,
                tempo_gasto=dados.tempo_gasto,
                respondido_em=datetime.now()
            )
            db.add(nova_resposta)

            if acertou:
                tentativa.pontuacao_total += pontos_ganhos

            db.commit()

    return {
        "acertou": acertou,
        "correta": alternativa_correta.texto,
        "pontos": pontos_ganhos,
        "dificuldade": pergunta.dificuldade
    }


# =========================
# SALVAR PONTUAÇÃO FINAL
# =========================
@app.post("/api/pontuacao")
def salvar_pontuacao(dados: PontuacaoCreate, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.id == dados.usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail={"erro": "Usuário não encontrado"})

    # atualiza melhor pontuação do usuário
    if dados.pontuacao > usuario.pontuacao:
        usuario.pontuacao = dados.pontuacao

    # se veio tentativa, finaliza ela
    if dados.tentativa_id:
        tentativa = db.query(Tentativa).filter(Tentativa.id == dados.tentativa_id).first()
        if tentativa:
            tentativa.pontuacao_total = dados.pontuacao
            tentativa.tempo_total = dados.tempo_total
            tentativa.finalizado_em = datetime.now()

    db.commit()
    db.refresh(usuario)

    return {
        "id": usuario.id,
        "nome": usuario.nome,
        "pontuacao": usuario.pontuacao
    }