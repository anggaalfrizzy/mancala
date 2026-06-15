# 🎮 Mancala AI — Adversarial Search

> **Tugas Project Kecerdasan Buatan — S1 Teknik Informatika**
> Implementasi Algoritma Minimax dan Alpha-Beta Pruning pada Permainan Mancala Berbasis Web menggunakan Flask

---

## 📌 Deskripsi

Aplikasi web interaktif permainan **Mancala** dengan AI menggunakan algoritma **Minimax** dan **Alpha-Beta Pruning**. Aplikasi ini memvisualisasikan game tree, menampilkan perbandingan jumlah node yang dievaluasi, dan mendukung pengaturan kedalaman pencarian.

---

## ✨ Fitur

| # | Fitur | Status |
|---|-------|--------|
| 1 | Mode Human vs AI (Minimax) | ✅ |
| 2 | Alpha-Beta Pruning | ✅ |
| 3 | Visualisasi Game Tree (≥3 level) | ✅ |
| 4 | Counter node: Minimax vs Alpha-Beta | ✅ |
| 5 | Toggle Minimax murni vs + Alpha-Beta | ✅ |
| 6 | Pengaturan kedalaman (depth 1-9) | ✅ |
| 7 | Indikator giliran & status game | ✅ |
| 8 | Tampilan responsif (desktop & mobile) | ✅ |
| 9 | Mode Human vs Human | ✅ Bonus |
| 10 | Tabel benchmark Depth 1-6 | ✅ Bonus |
| 11 | Tingkat kesulitan AI (Mudah/Sedang/Sulit) | ✅ Bonus |
| 12 | Animasi distribusi biji satu per satu | ✅ Bonus |

---

## 🎯 Aturan Mancala

- Papan: 6 lubang per pemain + 1 store (Mancala) per pemain
- Mulai: 4 benih per lubang
- Giliran ekstra: benih terakhir jatuh ke store sendiri
- Capture: benih terakhir ke lubang kosong milik sendiri, ambil benih dari lubang berlawanan
- Game over: salah satu sisi kosong, sisa benih masuk ke store masing-masing

---

## 🧠 Algoritma

### Minimax
```python
def minimax(board, depth, is_maximizing, player_turn):
    if terminal(board) or depth == 0:
        return evaluate(board)
    if is_maximizing:
        return max(minimax(move, depth-1, False) for move in moves)
    else:
        return min(minimax(move, depth-1, True) for move in moves)
```

### Alpha-Beta Pruning
```python
def alpha_beta(board, depth, alpha, beta, is_maximizing):
    if terminal(board) or depth == 0:
        return evaluate(board)
    for move in moves:
        val = alpha_beta(move, depth-1, alpha, beta, not is_maximizing)
        if is_maximizing:
            alpha = max(alpha, val)
        else:
            beta = min(beta, val)
        if beta <= alpha:
            break  # Pruning!
    return alpha if is_maximizing else beta
```

### Fungsi Evaluasi
```
score = store_AI - store_Human + 0.1 * (seeds_AI_side - seeds_Human_side)
```

---

## 🚀 Cara Menjalankan

### Prasyarat
- Python 3.9+
- pip

### Instalasi
```bash
git clone https://github.com/[username]/adversarial-search-[nim].git
cd adversarial-search-[nim]
pip install -r requirements.txt
python app.py
```
Buka browser: `http://localhost:5000`

### Production (dengan Gunicorn)
```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

---

## 🗂 Struktur Project

```
mancala/
├── app.py                  # Flask backend + algoritma AI
├── requirements.txt
├── README.md
├── templates/
│   └── index.html          # HTML utama
└── static/
    ├── css/
    │   └── style.css       # Styling
    └── js/
        └── game.js         # Logika frontend
```

---

## 📸 Screenshot

<img width="952" height="437" alt="image" src="https://github.com/user-attachments/assets/280c2b89-e457-46d8-be52-f9d148219f37" />


---

## 🔗 Link

- **Demo:** https://www.mancala.my.id/
- **GitHub:** https://github.com/anggaalfrizzy/mancala

---

## 📚 Referensi

1. Russell, S., & Norvig, P. (2020). *Artificial Intelligence: A Modern Approach* (4th ed.). Pearson.
2. Silver, D., et al. (2016). Mastering the game of Go with deep neural networks. *Nature*, 529(7587).
3. Campbell, M., et al. (2002). Deep Blue. *Artificial Intelligence*, 134(1-2), 57-83.
