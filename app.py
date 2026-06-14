from flask import Flask, render_template, request, jsonify
import time
import copy
import random

app = Flask(__name__)

# =====================================================================
# MANCALA GAME LOGIC
# =====================================================================
# Board representation: 14 slots
# Slots 0-5  : Player 1 pits (bottom, human)
# Slot 6     : Player 1 store (Mancala)
# Slots 7-12 : Player 2 pits (top, AI)
# Slot 13    : Player 2 store (Mancala)
# Starting seeds: 4 per pit

INITIAL_SEEDS = 4
NUM_PITS = 6

def create_board():
    """Create initial Mancala board."""
    board = [INITIAL_SEEDS] * 14
    board[6] = 0   # Player 1 store
    board[13] = 0  # Player 2 store
    return board

def get_valid_moves(board, player):
    """Return list of valid pit indices for the given player."""
    if player == 1:
        return [i for i in range(0, 6) if board[i] > 0]
    else:
        return [i for i in range(7, 13) if board[i] > 0]

def make_move(board, pit, player):
    """
    Execute a move. Returns (new_board, extra_turn, captured).
    extra_turn: True if player gets another turn.
    captured: number of seeds captured this move.
    """
    board = copy.copy(board)
    seeds = board[pit]
    board[pit] = 0
    pos = pit
    captured = 0

    # Distribute seeds counter-clockwise
    for _ in range(seeds):
        pos = (pos + 1) % 14
        # Skip opponent's store
        if player == 1 and pos == 13:
            pos = 0
        elif player == 2 and pos == 6:
            pos = 7
        board[pos] += 1

    # Check for extra turn: last seed lands in own store
    extra_turn = False
    if player == 1 and pos == 6:
        extra_turn = True
    elif player == 2 and pos == 13:
        extra_turn = True

    # Check for capture: last seed lands in own empty pit, opposite pit has seeds
    if not extra_turn:
        if player == 1 and 0 <= pos <= 5 and board[pos] == 1:
            opposite = 12 - pos
            if board[opposite] > 0:
                captured = board[opposite] + 1
                board[6] += captured
                board[pos] = 0
                board[opposite] = 0
        elif player == 2 and 7 <= pos <= 12 and board[pos] == 1:
            opposite = 12 - pos
            if board[opposite] > 0:
                captured = board[opposite] + 1
                board[13] += captured
                board[pos] = 0
                board[opposite] = 0

    return board, extra_turn, captured

def is_game_over(board):
    """Check if the game is over (one side is empty)."""
    p1_empty = all(board[i] == 0 for i in range(0, 6))
    p2_empty = all(board[i] == 0 for i in range(7, 13))
    return p1_empty or p2_empty

def finalize_board(board):
    """Sweep remaining seeds into stores when game is over."""
    board = copy.copy(board)
    board[6] += sum(board[0:6])
    board[13] += sum(board[7:13])
    for i in list(range(0, 6)) + list(range(7, 13)):
        board[i] = 0
    return board

def evaluate(board):
    """
    Heuristic evaluation function for AI (player 2).
    Returns score from AI's perspective.
    """
    # Primary: score difference
    score = board[13] - board[6]
    # Secondary: seeds on AI's side vs human's side (positional bonus)
    ai_side = sum(board[7:13])
    human_side = sum(board[0:6])
    score += 0.1 * (ai_side - human_side)
    return score

# =====================================================================
# MINIMAX ALGORITHM (Pure)
# =====================================================================
node_count_minimax = 0

def minimax(board, depth, is_maximizing, player_turn):
    """
    Pure Minimax algorithm.
    is_maximizing: True when it's AI's turn (player 2).
    player_turn: current player (1 or 2).
    Returns (score, move_sequence, node_count).
    """
    global node_count_minimax
    node_count_minimax += 1

    if is_game_over(board):
        final = finalize_board(board)
        return evaluate(final), [], node_count_minimax

    if depth == 0:
        return evaluate(board), [], node_count_minimax

    moves = get_valid_moves(board, player_turn)
    if not moves:
        # Switch player if no moves
        next_player = 3 - player_turn
        return minimax(board, depth - 1, not is_maximizing, next_player)

    best_move = None
    best_seq = []

    if is_maximizing:
        best_val = float('-inf')
        for pit in moves:
            new_board, extra, _ = make_move(board, pit, player_turn)
            if extra:
                val, seq, _ = minimax(new_board, depth, True, player_turn)
            else:
                val, seq, _ = minimax(new_board, depth - 1, False, 3 - player_turn)
            if val > best_val:
                best_val = val
                best_move = pit
                best_seq = [pit] + seq
        return best_val, best_seq, node_count_minimax
    else:
        best_val = float('inf')
        for pit in moves:
            new_board, extra, _ = make_move(board, pit, player_turn)
            if extra:
                val, seq, _ = minimax(new_board, depth, False, player_turn)
            else:
                val, seq, _ = minimax(new_board, depth - 1, True, 3 - player_turn)
            if val < best_val:
                best_val = val
                best_move = pit
                best_seq = [pit] + seq
        return best_val, best_seq, node_count_minimax

# =====================================================================
# ALPHA-BETA PRUNING ALGORITHM
# =====================================================================
node_count_alphabeta = 0

def alpha_beta(board, depth, alpha, beta, is_maximizing, player_turn, pruned_nodes_ref):
    """
    Minimax with Alpha-Beta Pruning.
    Returns (score, move_sequence, nodes_evaluated).
    """
    global node_count_alphabeta
    node_count_alphabeta += 1

    if is_game_over(board):
        final = finalize_board(board)
        return evaluate(final), [], node_count_alphabeta

    if depth == 0:
        return evaluate(board), [], node_count_alphabeta

    moves = get_valid_moves(board, player_turn)
    if not moves:
        next_player = 3 - player_turn
        return alpha_beta(board, depth - 1, alpha, beta, not is_maximizing, next_player, pruned_nodes_ref)

    best_move = None
    best_seq = []

    if is_maximizing:
        best_val = float('-inf')
        for pit in moves:
            new_board, extra, _ = make_move(board, pit, player_turn)
            if extra:
                val, seq, _ = alpha_beta(new_board, depth, alpha, beta, True, player_turn, pruned_nodes_ref)
            else:
                val, seq, _ = alpha_beta(new_board, depth - 1, alpha, beta, False, 3 - player_turn, pruned_nodes_ref)
            if val > best_val:
                best_val = val
                best_move = pit
                best_seq = [pit] + seq
            alpha = max(alpha, best_val)
            if beta <= alpha:
                pruned_nodes_ref[0] += 1  # Count pruned branch
                break  # Beta cutoff
        return best_val, best_seq, node_count_alphabeta
    else:
        best_val = float('inf')
        for pit in moves:
            new_board, extra, _ = make_move(board, pit, player_turn)
            if extra:
                val, seq, _ = alpha_beta(new_board, depth, alpha, beta, False, player_turn, pruned_nodes_ref)
            else:
                val, seq, _ = alpha_beta(new_board, depth - 1, alpha, beta, True, 3 - player_turn, pruned_nodes_ref)
            if val < best_val:
                best_val = val
                best_move = pit
                best_seq = [pit] + seq
            beta = min(beta, best_val)
            if beta <= alpha:
                pruned_nodes_ref[0] += 1  # Count pruned branch
                break  # Alpha cutoff
        return best_val, best_seq, node_count_alphabeta

# =====================================================================
# DIFFICULTY SYSTEM
# =====================================================================

def evaluate_root_moves(board, depth, use_alphabeta, player_turn=2):
    """
    Evaluate every valid move at the root and return a list of
    (pit, score, nodes) sorted from best to worst for the AI (player 2).
    Used to support adjustable difficulty levels.
    """
    global node_count_minimax, node_count_alphabeta
    moves = get_valid_moves(board, player_turn)
    results = []

    for pit in moves:
        new_board, extra, _ = make_move(board, pit, player_turn)

        if use_alphabeta:
            node_count_alphabeta = 0
            pruned_ref = [0]
            if extra:
                val, _, nodes = alpha_beta(new_board, depth, float('-inf'), float('inf'), True, player_turn, pruned_ref)
            else:
                val, _, nodes = alpha_beta(new_board, depth - 1, float('-inf'), float('inf'), False, 3 - player_turn, pruned_ref)
        else:
            node_count_minimax = 0
            if extra:
                val, _, nodes = minimax(new_board, depth, True, player_turn)
            else:
                val, _, nodes = minimax(new_board, depth - 1, False, 3 - player_turn)

        results.append({'pit': pit, 'score': val, 'nodes': nodes, 'extra': extra})

    # Sort descending: best move for AI (maximizer) first
    results.sort(key=lambda r: r['score'], reverse=True)
    return results


def select_move_by_difficulty(board, depth, use_alphabeta, difficulty):
    """
    Pick the AI's move according to difficulty level.

    - 'hard'   : always pick the optimal move (full strength).
    - 'medium' : usually picks a strong move, occasionally a mediocre one.
    - 'easy'   : frequently picks weak/random moves, rarely the best one.

    Returns (pit, score, nodes_evaluated, nodes_pruned_estimate, ranked_results)
    """
    ranked = evaluate_root_moves(board, depth, use_alphabeta, player_turn=2)

    if not ranked:
        return None, 0, 0, 0, ranked

    n = len(ranked)
    total_nodes = sum(r['nodes'] for r in ranked)

    if difficulty == 'hard' or n == 1:
        chosen = ranked[0]

    elif difficulty == 'medium':
        # 65% best move, 35% random among top half
        if random.random() < 0.65:
            chosen = ranked[0]
        else:
            half = max(1, n // 2)
            chosen = random.choice(ranked[:half])

    else:  # 'easy'
        # 15% best move, 85% random among ALL valid moves
        # (including weaker ones), biasing toward the weaker half
        if random.random() < 0.15:
            chosen = ranked[0]
        else:
            # Weight toward the worse half of moves
            worse_half = ranked[n // 2:] if n > 1 else ranked
            pool = worse_half if worse_half else ranked
            chosen = random.choice(pool)

    return chosen['pit'], chosen['score'], total_nodes, 0, ranked



def build_game_tree(board, depth, is_maximizing, player_turn, max_display_depth=3, alpha=float('-inf'), beta=float('inf'), use_pruning=False):
    """Build game tree data for visualization (limited to max_display_depth)."""
    node = {
        'board': board[:],
        'value': None,
        'children': [],
        'pruned': False,
        'depth': max_display_depth - depth,
        'player': player_turn,
        'is_max': is_maximizing
    }

    if is_game_over(board) or depth == 0:
        final = finalize_board(board) if is_game_over(board) else board
        node['value'] = round(evaluate(final), 2)
        node['is_leaf'] = True
        return node

    node['is_leaf'] = False
    moves = get_valid_moves(board, player_turn)
    if not moves:
        next_player = 3 - player_turn
        child = build_game_tree(board, depth - 1, not is_maximizing, next_player,
                                max_display_depth, alpha, beta, use_pruning)
        node['children'].append(child)
        node['value'] = child['value']
        return node

    best_val = float('-inf') if is_maximizing else float('inf')

    for pit in moves[:4]:  # Limit branching factor for display
        new_board, extra, _ = make_move(board, pit, player_turn)
        child_depth = depth if extra else depth - 1
        child_max = is_maximizing if extra else not is_maximizing
        child_player = player_turn if extra else 3 - player_turn

        if depth > 1:  # Build sub-tree only if not at display limit
            child = build_game_tree(new_board, child_depth - (0 if extra else 0),
                                    child_max, child_player,
                                    max_display_depth, alpha, beta, use_pruning)
        else:
            child = {
                'board': new_board[:],
                'value': round(evaluate(new_board), 2),
                'children': [],
                'pruned': False,
                'depth': max_display_depth - depth + 1,
                'player': child_player,
                'is_max': child_max,
                'is_leaf': True,
                'move': pit
            }

        child['move'] = pit
        node['children'].append(child)

        if child['value'] is not None:
            if is_maximizing:
                best_val = max(best_val, child['value'])
                if use_pruning:
                    alpha = max(alpha, best_val)
            else:
                best_val = min(best_val, child['value'])
                if use_pruning:
                    beta = min(beta, best_val)

            if use_pruning and beta <= alpha:
                # Mark remaining siblings as pruned
                remaining = [m for m in moves[:4] if m not in [c.get('move') for c in node['children']]]
                for rm in remaining:
                    node['children'].append({
                        'board': board[:],
                        'value': None,
                        'children': [],
                        'pruned': True,
                        'depth': max_display_depth - depth + 1,
                        'player': child_player,
                        'is_max': child_max,
                        'is_leaf': True,
                        'move': rm,
                        'alpha': round(alpha, 2),
                        'beta': round(beta, 2)
                    })
                break

    node['value'] = round(best_val, 2) if best_val not in [float('-inf'), float('inf')] else 0
    node['alpha'] = round(alpha, 2) if alpha != float('-inf') else '-∞'
    node['beta'] = round(beta, 2) if beta != float('inf') else '+∞'
    return node


# =====================================================================
# FLASK ROUTES
# =====================================================================

@app.route('/')
def index():
    """Serve the main Mancala game page."""
    return render_template('index.html')

@app.route('/api/new_game', methods=['POST'])
def new_game():
    """Start a new game and return the initial board state."""
    board = create_board()
    return jsonify({'board': board, 'current_player': 1, 'game_over': False})

@app.route('/api/move', methods=['POST'])
def move():
    """Apply a human player's move and return the resulting board state."""
    data = request.json
    board = data['board']
    pit = data['pit']
    player = data['player']

    if board[pit] == 0:
        return jsonify({'error': 'Invalid move'}), 400

    new_board, extra_turn, captured = make_move(board, pit, player)
    game_over = is_game_over(new_board)

    if game_over:
        new_board = finalize_board(new_board)

    next_player = player if extra_turn else 3 - player
    winner = None
    if game_over:
        if new_board[6] > new_board[13]:
            winner = 1
        elif new_board[13] > new_board[6]:
            winner = 2
        else:
            winner = 0  # Draw

    return jsonify({
        'board': new_board,
        'next_player': next_player,
        'extra_turn': extra_turn,
        'captured': captured,
        'game_over': game_over,
        'winner': winner
    })

@app.route('/api/ai_move', methods=['POST'])
def ai_move():
    """
    Compute and apply the AI's move using Minimax or Alpha-Beta Pruning.
    The 'difficulty' parameter ('easy', 'medium', 'hard') controls whether
    the AI always plays optimally or occasionally picks a weaker move.
    """
    data = request.json
    board = data['board']
    depth = int(data.get('depth', 5))
    use_alphabeta = data.get('use_alphabeta', True)
    difficulty = data.get('difficulty', 'hard')  # 'easy', 'medium', 'hard'

    global node_count_minimax, node_count_alphabeta

    start_time = time.time()

    # For 'hard' mode, use the full minimax/alpha-beta directly so that
    # the node-count statistics reflect the true single-search numbers
    # (used for the educational Minimax vs Alpha-Beta comparison).
    if difficulty == 'hard':
        node_count_minimax = 0
        node_count_alphabeta = 0

        if use_alphabeta:
            pruned_ref = [0]
            score, seq, nodes = alpha_beta(board, depth, float('-inf'), float('inf'), True, 2, pruned_ref)
            algo = 'alphabeta'
            nodes_pruned = pruned_ref[0]
        else:
            score, seq, nodes = minimax(board, depth, True, 2)
            algo = 'minimax'
            nodes_pruned = 0

        if not seq:
            moves = get_valid_moves(board, 2)
            best_pit = moves[0] if moves else None
        else:
            best_pit = seq[0]
    else:
        # 'easy' / 'medium': evaluate all root moves, then pick according
        # to difficulty (may choose a suboptimal move on purpose).
        best_pit, score, nodes, _, ranked = select_move_by_difficulty(board, depth, use_alphabeta, difficulty)
        algo = 'alphabeta' if use_alphabeta else 'minimax'
        nodes_pruned = 0

    elapsed = round((time.time() - start_time) * 1000, 2)  # ms

    if best_pit is None:
        return jsonify({'error': 'No valid moves'}), 400

    new_board, extra_turn, captured = make_move(board, best_pit, 2)
    game_over = is_game_over(new_board)
    if game_over:
        new_board = finalize_board(new_board)

    next_player = 2 if extra_turn else 1
    winner = None
    if game_over:
        if new_board[6] > new_board[13]:
            winner = 1
        elif new_board[13] > new_board[6]:
            winner = 2
        else:
            winner = 0

    return jsonify({
        'board': new_board,
        'pit': best_pit,
        'next_player': next_player,
        'extra_turn': extra_turn,
        'captured': captured,
        'game_over': game_over,
        'winner': winner,
        'algorithm': algo,
        'difficulty': difficulty,
        'nodes_evaluated': nodes,
        'nodes_pruned': nodes_pruned,
        'time_ms': elapsed,
        'score': round(score, 2)
    })

@app.route('/api/game_tree', methods=['POST'])
def game_tree():
    """Build a limited-depth game tree (for visualization) from the given board."""
    data = request.json
    board = data['board']
    player = data.get('player', 2)
    depth = min(int(data.get('depth', 3)), 3)  # Cap at 3 for display
    use_pruning = data.get('use_alphabeta', True)

    is_max = (player == 2)
    tree = build_game_tree(board, depth, is_max, player,
                           max_display_depth=depth,
                           use_pruning=use_pruning)
    return jsonify({'tree': tree})

@app.route('/api/benchmark', methods=['POST'])
def benchmark():
    """Compare Minimax vs Alpha-Beta across depths 1-6."""
    data = request.json
    board = data.get('board', create_board())
    results = []

    for d in range(1, 7):
        global node_count_minimax, node_count_alphabeta
        node_count_minimax = 0
        node_count_alphabeta = 0

        # Minimax
        t0 = time.time()
        _, _, mm_nodes = minimax(board, d, True, 2)
        mm_time = round((time.time() - t0) * 1000, 2)

        # Alpha-Beta
        node_count_alphabeta = 0
        pruned_ref = [0]
        t0 = time.time()
        _, _, ab_nodes = alpha_beta(board, d, float('-inf'), float('inf'), True, 2, pruned_ref)
        ab_time = round((time.time() - t0) * 1000, 2)

        pruning_pct = round((1 - ab_nodes / mm_nodes) * 100, 1) if mm_nodes > 0 else 0

        results.append({
            'depth': d,
            'minimax_nodes': mm_nodes,
            'alphabeta_nodes': ab_nodes,
            'minimax_time_ms': mm_time,
            'alphabeta_time_ms': ab_time,
            'pruning_percentage': pruning_pct
        })

    return jsonify({'results': results})

import os

if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000))
    )
