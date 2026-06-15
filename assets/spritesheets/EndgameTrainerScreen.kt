package de.magicfoxstudios.chesstrainer.ui.screens.endgame

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import de.magicfoxstudios.chesstrainer.ui.components.rememberChessBoardDragHandler
import de.magicfoxstudios.chesstrainer.ui.components.ChessBoardDragPieceOverlay
import de.magicfoxstudios.chesstrainer.ui.components.NetworkErrorOverlay
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.magicfoxstudios.chesstrainer.R
import de.magicfoxstudios.chesstrainer.ui.utils.SpeechUtils
import de.magicfoxstudios.chesstrainer.core.chess.FenHelper
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.pow
import kotlin.math.abs
import android.media.MediaPlayer
import android.util.Log
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import java.util.Locale
import kotlinx.coroutines.delay
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

val perfectDe = listOf(
    R.raw.move_perfect01_de, R.raw.move_perfect02_de, R.raw.move_perfect03_de, 
    R.raw.move_perfect04_de, R.raw.move_perfect05_de, R.raw.move_perfect06_de, 
    R.raw.move_perfect07_de, R.raw.move_perfect08_de, R.raw.move_perfect09_de, 
    R.raw.move_perfect10_de, R.raw.move_perfect11_de, R.raw.move_perfect12_de, 
    R.raw.move_perfect13_de, R.raw.move_perfect14_de, R.raw.move_perfect15_de,
    R.raw.move_perfect16_de, R.raw.move_perfect17_de, R.raw.move_perfect18_de,
    R.raw.move_perfect19_de, R.raw.move_perfect20_de, R.raw.move_perfect21_de,
    R.raw.move_perfect22_de, R.raw.move_perfect23_de, R.raw.move_perfect24_de,
    R.raw.move_perfect25_de, R.raw.move_perfect26_de
)

val perfectEn = listOf(
    R.raw.move_perfect01_en, R.raw.move_perfect02_en, R.raw.move_perfect03_en, 
    R.raw.move_perfect04_en, R.raw.move_perfect05_en, R.raw.move_perfect06_en, 
    R.raw.move_perfect07_en, R.raw.move_perfect08_en, R.raw.move_perfect9_en,
    R.raw.move_perfect10_en
)

val okDe = listOf(
    R.raw.move_ok01_de, R.raw.move_ok02_de, R.raw.move_ok03_de, R.raw.move_ok04_de, 
    R.raw.move_ok05_de, R.raw.move_ok06_de, R.raw.move_ok07_de, R.raw.move_ok08_de, 
    R.raw.move_ok09_de, R.raw.move_ok10_de, R.raw.move_ok11_de, R.raw.move_ok12_de, 
    R.raw.move_ok13_de, R.raw.move_ok14_de, R.raw.move_ok15_de, R.raw.move_ok16_de,
    R.raw.move_ok17_de, R.raw.move_ok18_de, R.raw.move_ok19_de, R.raw.move_ok20_de,
    R.raw.move_ok21_de, R.raw.move_ok22_de, R.raw.move_ok23_de, R.raw.move_ok24_de,
    R.raw.move_ok25_de, R.raw.move_ok26_de, R.raw.move_ok27_de, R.raw.move_ok28_de,
    R.raw.move_ok29_de, R.raw.move_ok30_de
)

val okEn = listOf(
    R.raw.move_ok01_en, R.raw.move_ok02_en, R.raw.move_ok03_en, R.raw.move_ok04_en, 
    R.raw.move_ok05_en, R.raw.move_ok06_en, R.raw.move_ok07_en, R.raw.move_ok08_en, 
    R.raw.move_ok09_en, R.raw.move_ok10_en
)

val badDe = listOf(
    R.raw.move_bad01_de, R.raw.move_bad02_de, R.raw.move_bad03_de, R.raw.move_bad04_de, 
    R.raw.move_bad05_de, R.raw.move_bad06_de, R.raw.move_bad07_de, R.raw.move_bad08_de, 
    R.raw.move_bad09_de, R.raw.move_bad10_de, R.raw.move_bad11_de, R.raw.move_bad12_de, 
    R.raw.move_bad13_de, R.raw.move_bad14_de, R.raw.move_bad15_de
)

val badEn = listOf(
    R.raw.move_bad01_en, R.raw.move_bad02_en, R.raw.move_bad03_en, R.raw.move_bad04_en, 
    R.raw.move_bad05_en, R.raw.move_bad06_en, R.raw.move_bad07_en, R.raw.move_bad08_en, 
    R.raw.move_bad09_en, R.raw.move_bad10_en
)

fun getRandomAudioResId(quality: MoveQuality, isGerman: Boolean): Int {
    val list = when (quality) {
        MoveQuality.PERFECT -> if (isGerman) perfectDe else perfectEn
        MoveQuality.INACCURACY -> if (isGerman) okDe else okEn
        MoveQuality.BLUNDER -> if (isGerman) badDe else badEn
    }
    return if (list.isNotEmpty()) list.random() else 0
}

fun getComicPieceDrawable(c: Char): Int? {
    return when (c) {
        'K' -> R.drawable.pieces_westerncomic_w_k
        'Q' -> R.drawable.pieces_westerncomic_w_q
        'R' -> R.drawable.pieces_westerncomic_w_r
        'B' -> R.drawable.pieces_westerncomic_w_b
        'N' -> R.drawable.pieces_westerncomic_w_n
        'P' -> R.drawable.pieces_westerncomic_w_p
        'k' -> R.drawable.pieces_westerncomic_b_k
        'q' -> R.drawable.pieces_westerncomic_b_q
        'r' -> R.drawable.pieces_westerncomic_b_r
        'b' -> R.drawable.pieces_westerncomic_b_b
        'n' -> R.drawable.pieces_westerncomic_b_n
        'p' -> R.drawable.pieces_westerncomic_b_p
        else -> null
    }
}

enum class IntroAnimationState {
    PLAYING,
    TRANSITIONING,
    FINISHED
}

@Composable
fun EndgameTrainerScreen(
    viewModel: EndgameTrainerViewModel,
    currentElo: Int,
    isSoundEnabled: Boolean = true,
    isDebugDifficultyEnabled: Boolean = false,
    isComicStyleEnabled: Boolean = false,
    isJailUnlocked: Boolean = false,
    onBack: () -> Unit,
    onGoldEarned: (Int) -> Unit,
    onEloChanged: (Int) -> Unit,
    onBanditCaptured: (String) -> Unit = {},
    onOpenTutorial: () -> Unit = {}
) {
    val uiState by viewModel.ui.collectAsState()
    val board = FenHelper.toBoard(uiState.fen)
    val scrollState = rememberScrollState()
    val context = LocalContext.current

    var soundPlayer by remember { mutableStateOf<MediaPlayer?>(null) }
    
    var introAnimationState by remember { mutableStateOf(IntroAnimationState.FINISHED) }
    var horseAnimationIndex by remember { mutableIntStateOf(1) }
    
    LaunchedEffect(uiState.isEngineThinking, uiState.movesPlayed) {
        if (uiState.isEngineThinking && uiState.movesPlayed == 0) {
            if (!uiState.isDuel) {
                horseAnimationIndex = (1..3).random()
            }
            introAnimationState = IntroAnimationState.PLAYING
        }
    }

    // Speech text mapping
    val speechText = when (val msg = uiState.message) {
        is UiText.DynamicString -> msg.value
        is UiText.StringResource -> stringResource(msg.resId, *msg.args.toTypedArray())
        null -> when (uiState.lastMoveQuality) {
            MoveQuality.PERFECT -> stringResource(SpeechUtils.getSpeechResource(MoveQuality.PERFECT, uiState.speechRandomIndex))
            MoveQuality.INACCURACY -> stringResource(SpeechUtils.getSpeechResource(MoveQuality.INACCURACY, uiState.speechRandomIndex))
            MoveQuality.BLUNDER -> stringResource(SpeechUtils.getSpeechResource(MoveQuality.BLUNDER, uiState.speechRandomIndex))
            else -> null
        }
    }

    // Overlay Animation State
    var playedAnimationForFen by remember { mutableStateOf<String?>(null) }
    var currentAnimationType by remember { mutableStateOf<Boolean?>(null) } // true = win, false = loss
    var currentAnimationText by remember { mutableStateOf("") }



    LaunchedEffect(uiState.message, uiState.fen) {
        if (uiState.message != null && playedAnimationForFen != uiState.fen) {
            val msgResId = (uiState.message as? UiText.StringResource)?.resId
            val isWin = msgResId in listOf(R.string.mate_perfect, R.string.mate_not_optimal_singular, R.string.mate_not_optimal_plural, R.string.duel_won, R.string.duel_won_jail)
            val isLoss = msgResId in listOf(R.string.draw_insufficient, R.string.draw_stalemate, R.string.not_winnable, R.string.duel_lost)
            
            if (isWin) {
                currentAnimationType = true
                currentAnimationText = if (uiState.isDuel) {
                    val buildingId = uiState.currentMission.substringAfter("duel_")
                    if (buildingId == "JAIL") {
                        context.getString(R.string.duel_won_jail)
                    } else {
                        context.getString(R.string.jail_msg_captured)
                    }
                } else {
                    speechText ?: "SCHACHMATT!"
                }
                playedAnimationForFen = uiState.fen
            } else if (isLoss) {
                currentAnimationType = false
                currentAnimationText = speechText ?: "VERFLIXT!"
                playedAnimationForFen = uiState.fen
            }
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(viewModel) {
        onDispose {
            Log.d("LifecycleDebug", "EndgameTrainerScreen disposed, stopping mission")
            viewModel.stopMission()
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            Log.d("SoundDebug", "Lifecycle event: $event")
            if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) {
                Log.d("SoundDebug", "Stopping sound due to lifecycle event: $event, player exists: ${soundPlayer != null}")
                if (soundPlayer?.isPlaying == true) {
                    Log.d("SoundDebug", "Found active soundPlayer, calling stop()")
                    soundPlayer?.stop()
                }
                soundPlayer?.release()
                soundPlayer = null
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            soundPlayer?.release()
            soundPlayer = null
        }
    }

    LaunchedEffect(uiState.movesPlayed, uiState.lastMoveQuality, isSoundEnabled) {
        val quality = uiState.lastMoveQuality
        if (quality != null && isSoundEnabled && uiState.shouldPlayMoveSound) {
            // User requirement: Do not interrupt currently playing sounds.
            // If it's already playing, we just skip the new one.
            if (soundPlayer?.isPlaying == true) {
                Log.d("SoundDebug", "Sound already playing, skipping new move audio.")
                return@LaunchedEffect
            }
            
            soundPlayer?.release()
            soundPlayer = null
            
            val isGerman = Locale.getDefault().language == "de"
            val resId = getRandomAudioResId(quality, isGerman)
            
            if (resId != 0) {
                Log.d("SoundDebug", "Creating MediaPlayer for resId: $resId")
                val player = MediaPlayer.create(context, resId)
                player?.setOnCompletionListener {
                    it.release()
                    if (soundPlayer == it) {
                        soundPlayer = null
                    }
                }
                soundPlayer = player
                player?.start()
            }
        }
    }

    // Selection state: null or Pair(x, y)
    var selectedSquare by remember { mutableStateOf<Pair<Int, Int>?>(null) }

    val missionTitle = when (uiState.currentMission) {
        "random_Q" -> stringResource(R.string.mission_mate_q_name)
        "random_RR" -> stringResource(R.string.mission_mate_rr_name)
        "random_R" -> stringResource(R.string.mission_mate_r_name)
        "random_BB" -> stringResource(R.string.mission_mate_bb_name)
        "random_BN" -> stringResource(R.string.mission_mate_bn_name)
        "random_NP" -> stringResource(R.string.mission_stables_knpk_name)
        "random_Pn" -> stringResource(R.string.mission_stables_kpn_name)
        "random_NPn" -> stringResource(R.string.mission_stables_npn_name)
        "random_NPP" -> stringResource(R.string.mission_stables_nppn_name)
        "random_NPPn" -> stringResource(R.string.mission_stables_nppn_vs_n_name)
        "random_Qn" -> stringResource(R.string.mission_saloon_kqn_name)
        "random_Qb" -> stringResource(R.string.mission_saloon_kqb_name)
        "random_Qr" -> stringResource(R.string.mission_saloon_kqr_name)
        "random_Rn" -> stringResource(R.string.mission_saloon_krn_name)
        "random_BBn" -> stringResource(R.string.mission_saloon_bbn_name)
        "random_Qbb" -> stringResource(R.string.mission_saloon_qbb_name)
        "random_Qnn" -> stringResource(R.string.mission_saloon_qnn_name)
        "random_PP" -> stringResource(R.string.mission_barber_pp_name)
        "random_P" -> stringResource(R.string.mission_barber_p_name)
        "random_PPp" -> stringResource(R.string.mission_barber_ppp_name)
        "random_Rp" -> stringResource(R.string.mission_doctor_rp_name)
        "random_Rpp" -> stringResource(R.string.mission_doctor_rpp_name)
        "random_RPr" -> stringResource(R.string.mission_doctor_rpr_name)
        "random_BPb" -> stringResource(R.string.mission_windmill_bpb_name)
        "random_BPPb" -> stringResource(R.string.mission_windmill_bppb_name)
        "random_QP" -> stringResource(R.string.mission_court_qp_name)
        "random_QPPq" -> stringResource(R.string.mission_court_qppq_name)
        "random_QPq" -> stringResource(R.string.mission_court_qpq_name)
        "random_RRbn" -> stringResource(R.string.mission_workshop_rrbk_name)
        else -> {
            if (uiState.isDuel) {
                val buildingId = uiState.currentMission.substringAfter("duel_")
                when (buildingId) {
                    "SCHOOL" -> stringResource(R.string.duel_title_school)
                    "BARBER" -> stringResource(R.string.duel_title_barber)
                    "HORSES" -> stringResource(R.string.duel_title_horses)
                    "SMITHY" -> stringResource(R.string.duel_title_smithy)
                    "WINDMILL" -> stringResource(R.string.duel_title_windmill)
                    "DOCTOR" -> stringResource(R.string.duel_title_doctor)
                    "WORKSHOP" -> stringResource(R.string.duel_title_workshop)
                    "SALOON" -> stringResource(R.string.duel_title_saloon)
                    "COURT" -> stringResource(R.string.duel_title_court)
                    "BANK" -> stringResource(R.string.duel_title_bank)
                    "JAIL" -> stringResource(R.string.duel_title_jail)
                    "STAGECOACH" -> stringResource(R.string.duel_title_stagecoach)
                    else -> stringResource(R.string.duel_title_school)
                }
            } else {
                val buildingId = uiState.currentMission.substringAfter("duel_")
                when (buildingId) {
                    "SCHOOL" -> stringResource(R.string.building_school_name)
                    "SMITHY" -> stringResource(R.string.building_smithy_name)
                    "HORSES" -> stringResource(R.string.building_horses_name)
                    "COURT" -> stringResource(R.string.building_court_name)
                    "DOCTOR" -> stringResource(R.string.building_doctor_name)
                    "WINDMILL" -> stringResource(R.string.building_windmill_name)
                    "SALOON" -> stringResource(R.string.building_saloon_name)
                    "BARBER" -> stringResource(R.string.building_barber_name)
                    "WORKSHOP" -> stringResource(R.string.building_workshop_name)
                    else -> "Villain Duel"
                }
            }
        }
    }

    val validTargets = remember(selectedSquare, uiState.legalMoves) {
        if (selectedSquare == null) {
            emptySet<Pair<Int, Int>>()
        } else {
            val (fx, fy) = selectedSquare!!
            val prefix = "${('a' + fx)}${8 - fy}"
            uiState.legalMoves
                .filter { it.startsWith(prefix) }
                .map { uci ->
                    val tx = uci[2] - 'a'
                    val ty = 8 - uci[3].digitToInt()
                    Pair(tx, ty)
                }
                .toSet()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            topBar = {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 48.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = missionTitle,
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        ) { pad ->
            Column(
                modifier = Modifier
                    .padding(pad)
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
                    .verticalScroll(scrollState)
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                if (uiState.isDuel && uiState.survivalGoal != null) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFD32F2F), // Reddish for villain duel
                            shadowElevation = 4.dp,
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = if (uiState.survivalGoal == 1) 
                                        stringResource(R.string.duel_survival_title_singular)
                                    else 
                                        stringResource(R.string.duel_survival_title, uiState.survivalGoal!!),
                                    style = MaterialTheme.typography.titleLarge,
                                    color = Color.White,
                                    fontWeight = FontWeight.ExtraBold,
                                    textAlign = TextAlign.Center
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = stringResource(R.string.duel_progress, uiState.movesPlayed, uiState.survivalGoal!!),
                                    style = MaterialTheme.typography.titleMedium,
                                    color = Color.White.copy(alpha = 0.9f)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        val buildingId = uiState.currentMission.substringAfter("duel_")
                        val portraitResId = when (buildingId) {
                            "SCHOOL" -> R.drawable.opponent_school
                            "BARBER" -> R.drawable.opponent_barber
                            "HORSES" -> R.drawable.opponent_horses
                            "SMITHY" -> R.drawable.opponent_smithy
                            "WINDMILL" -> R.drawable.opponent_windmill
                            "DOCTOR" -> R.drawable.opponent_doctor
                            "WORKSHOP" -> R.drawable.opponent_workshop
                            "SALOON" -> R.drawable.opponent_saloon
                            "COURT" -> R.drawable.opponent_court
                            // "BANK" -> R.drawable.opponent_barber // Placeholder
                            // "JAIL" -> R.drawable.opponent_smithy // Placeholder
                            // "STAGECOACH" -> R.drawable.opponent_windmill // Placeholder
                            else -> R.drawable.opponent_school // Fallback
                        }

                        Image(
                            painter = painterResource(id = portraitResId),
                            contentDescription = "Villain",
                            modifier = Modifier.size(80.dp)
                        )
                    }
                }
 else if (uiState.initialMateIn != null) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        modifier = Modifier.padding(bottom = 8.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.mate_in_instruction, uiState.initialMateIn!!),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                    }
                } else if (!uiState.isEngineThinking && uiState.generationAttempts > 0) {
                    // Bei 7-Steiner oder wenn keine Mate-Info von der Tablebase vorhanden ist
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        modifier = Modifier.padding(bottom = 8.dp)
                    ) {
                        Text(
                            text = stringResource(if (uiState.isDuel) R.string.survival_challenge else R.string.winning_position),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                    }
                }

                // Board Overlay
                val dragHandler = rememberChessBoardDragHandler(
                    board = board,
                    isEnabled = !uiState.isEngineThinking && !uiState.isGameOver && !uiState.isSurvivalGoalReached,
                    canDragPiece = { it.isUpperCase() },
                    onDragStarted = { logicalX, logicalY ->
                        selectedSquare = Pair(logicalX, logicalY)
                    },
                    onDragMove = { fromX, fromY, toX, toY ->
                        viewModel.onUserMove(fromX, fromY, toX, toY, currentElo, onGoldEarned, onEloChanged)
                        selectedSquare = null
                    },
                    onDragCancelled = {
                        selectedSquare = null
                    }
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .border(4.dp, Color(0xFF5D4037), RoundedCornerShape(4.dp))
                        .then(dragHandler.modifier)
                ) {
                    // Squares and pieces
                    Column(modifier = Modifier.fillMaxSize()) {
                        for (y in 0..7) {
                            Row(modifier = Modifier.weight(1f)) {
                                for (x in 0..7) {
                                    val isLightSquare = (x + y) % 2 == 0
                                    // Brown western wood-like colors
                                    val baseColor = if (isLightSquare) Color(0xFFF0D9B5) else Color(0xFFB58863)
                                    val isSelected = selectedSquare?.first == x && selectedSquare?.second == y
                                    val isValidTarget = Pair(x, y) in validTargets
                                    val color = if (isSelected) Color(0xFFF6F669) else baseColor

                                    val pieceChar = board[y][x]

                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .fillMaxHeight()
                                            .background(color)
                                            .clickable(enabled = !uiState.isEngineThinking && !uiState.isGameOver && !uiState.isSurvivalGoalReached) {
                                                if (selectedSquare == null) {
                                                    if (pieceChar != ' ' && pieceChar.isUpperCase()) { // only select white pieces
                                                        val prefix = "${('a' + x)}${8 - y}"
                                                        if (uiState.legalMoves.any { it.startsWith(prefix) }) {
                                                            selectedSquare = Pair(x, y)
                                                        }
                                                    }
                                                } else {
                                                    val (fromX, fromY) = selectedSquare!!
                                                    if (fromX == x && fromY == y) {
                                                        selectedSquare = null // deselect
                                                    } else if (pieceChar != ' ' && pieceChar.isUpperCase()) {
                                                        val prefix = "${('a' + x)}${8 - y}"
                                                        if (uiState.legalMoves.any { it.startsWith(prefix) }) {
                                                            selectedSquare = Pair(x, y) // switch selection
                                                        } else {
                                                            selectedSquare = null
                                                        }
                                                    } else if (isValidTarget) {
                                                        viewModel.onUserMove(fromX, fromY, x, y, currentElo, onGoldEarned, onEloChanged)
                                                        selectedSquare = null
                                                    } else {
                                                        // Invalid target clicked
                                                        selectedSquare = null
                                                    }
                                                }
                                            },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        if (x == 7) {
                                            Text(
                                                text = (8 - y).toString(),
                                                color = if (isLightSquare) Color(0xFFB58863) else Color(0xFFF0D9B5),
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.align(Alignment.TopEnd).padding(end = 4.dp, top = 2.dp)
                                            )
                                        }
                                        if (y == 7) {
                                            Text(
                                                text = ('a' + x).toString(),
                                                color = if (isLightSquare) Color(0xFFB58863) else Color(0xFFF0D9B5),
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.align(Alignment.BottomStart).padding(start = 4.dp, bottom = 2.dp)
                                            )
                                        }
                                        if (isValidTarget) {
                                            Box(
                                                modifier = Modifier
                                                    .size(16.dp)
                                                    .background(Color.Black.copy(alpha = 0.25f), CircleShape)
                                            )
                                        }
                                        if (pieceChar != ' ') {
                                            if (isComicStyleEnabled) {
                                                val drawableId = getComicPieceDrawable(pieceChar)
                                                if (drawableId != null) {
                                                    Image(
                                                        painter = painterResource(id = drawableId),
                                                        contentDescription = null,
                                                        modifier = Modifier.fillMaxSize().padding(4.dp)
                                                    )
                                                }
                                            } else {
                                                val pieceSymbol = getPieceSymbol(pieceChar)
                                                if (pieceSymbol.isNotEmpty()) {
                                                    val isWhite = pieceChar.isUpperCase()
                                                    val fillColor = if (isWhite) Color(0xFFFFFFFF) else Color(0xFF222222)
                                                    val strokeColor = if (isWhite) Color(0xFF3E2723) else Color(0xFFEEEEEE)

                                                    Box(contentAlignment = Alignment.Center, modifier = Modifier.offset(y = (-2).dp)) {
                                                        // Draw Outline with Shadow for a pop-out token effect
                                                        Text(
                                                            text = pieceSymbol,
                                                            fontSize = 36.sp,
                                                            color = strokeColor,
                                                            style = TextStyle(
                                                                drawStyle = Stroke(
                                                                    width = 4f,
                                                                    join = StrokeJoin.Round
                                                                ),
                                                                shadow = Shadow(
                                                                    color = Color.Black.copy(alpha = 0.4f),
                                                                    offset = Offset(2f, 4f),
                                                                    blurRadius = 3f
                                                                )
                                                            )
                                                        )
                                                        // Draw inner solid color
                                                        Text(
                                                            text = pieceSymbol,
                                                            fontSize = 36.sp,
                                                            color = fillColor
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Arrows Overlay
                    Canvas(modifier = Modifier.matchParentSize()) {
                        val cellW = size.width / 8
                        val cellH = size.height / 8
                        
                        fun drawArrow(uci: String, arrowColor: Color) {
                            if (uci.length < 4) return
                            val fx = uci[0] - 'a'
                            val fy = 8 - uci[1].digitToInt()
                            val tx = uci[2] - 'a'
                            val ty = 8 - uci[3].digitToInt()
                            
                            val startX = (fx + 0.5f) * cellW
                            val startY = (fy + 0.5f) * cellH
                            val endX = (tx + 0.5f) * cellW
                            val endY = (ty + 0.5f) * cellH
                            
                            val dx = endX - startX
                            val dy = endY - startY
                            val distance = sqrt((dx * dx) + (dy * dy))
                            
                            if (distance < 1f) return
                            
                            // Shorten the arrow on both sides so it doesn't cover the piece centers
                            val shortenDistance = 0.35f * cellW
                            val shortenRatio = (shortenDistance / distance).coerceAtMost(0.45f)
                            
                            val sX = startX + dx * shortenRatio
                            val sY = startY + dy * shortenRatio
                            val eX = endX - dx * shortenRatio
                            val eY = endY - dy * shortenRatio
                            
                            val start = Offset(sX, sY)
                            val end = Offset(eX, eY)
                            
                            // Draw line
                            drawLine(
                                color = arrowColor,
                                start = start,
                                end = end,
                                strokeWidth = 12f,
                                cap = StrokeCap.Round
                            )
                            
                            // Draw arrowhead
                            val angle = atan2(end.y - start.y, end.x - start.x)
                            val arrowLen = 30f
                            val arrowAngle = Math.PI / 6
                            
                            val p1 = Offset(end.x - arrowLen * cos(angle - arrowAngle).toFloat(), end.y - arrowLen * sin(angle - arrowAngle).toFloat())
                            val p2 = Offset(end.x - arrowLen * cos(angle + arrowAngle).toFloat(), end.y - arrowLen * sin(angle + arrowAngle).toFloat())
                            
                            val path = Path().apply {
                                moveTo(end.x, end.y)
                                lineTo(p1.x, p1.y)
                                lineTo(p2.x, p2.y)
                                close()
                            }
                            drawPath(path, arrowColor)
                        }

                        // Draw Hint Arrows if requested
                        if (uiState.showHint) {
                            uiState.currentOptimalMoves.forEach { optimalUci ->
                                drawArrow(optimalUci, Color(0xFF4CAF50).copy(alpha = 0.9f)) // Brighter green for hints
                            }
                        } else {
                            // Dark green optimal moves if last move was inaccuracy/blunder
                            if (uiState.lastMoveQuality == MoveQuality.INACCURACY || uiState.lastMoveQuality == MoveQuality.BLUNDER) {
                                uiState.optimalMovesForLastTurn.forEach { optimalUci ->
                                    drawArrow(optimalUci, Color(0xFF2E7D32).copy(alpha = 0.8f))
                                }
                                uiState.lastWhiteMove?.let { whiteUci ->
                                    drawArrow(whiteUci, Color.Red.copy(alpha = 0.8f))
                                }
                            } else {
                                // Gray if perfect
                                uiState.lastWhiteMove?.let { whiteUci ->
                                    drawArrow(whiteUci, Color.DarkGray.copy(alpha = 0.6f))
                                }
                            }

                            // Gray for black's last move
                            uiState.lastBlackMove?.let { blackUci ->
                                drawArrow(blackUci, Color.DarkGray.copy(alpha = 0.8f))
                            }
                        }
                    }

                    // Drag-and-Drop Piece Overlay (rendering only)
                    ChessBoardDragPieceOverlay(
                        handler = dragHandler,
                        isComicStyleEnabled = isComicStyleEnabled
                    )
                }

                // The Difficulty Bar, directly under the board
                uiState.rewardEvaluation?.let { evaluation ->
                    if (uiState.isDuel) {
                        DuelGoldDisplay(
                            goldAmount = uiState.fixedDuelGold ?: 0,
                            eloAmount = uiState.fixedDuelElo ?: 0
                        )
                    } else if (isDebugDifficultyEnabled) {
                        DifficultyDebugBar(
                            evaluation = evaluation,
                            currentElo = currentElo,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }

                if (uiState.isEngineThinking && uiState.movesPlayed == 0 && introAnimationState == IntroAnimationState.FINISHED) {
                    // Anzeige des Versuchs beim Laden
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                        Spacer(modifier = Modifier.width(16.dp))
                        Text(
                            text = stringResource(
                                if (uiState.isDuel) R.string.loading_preparing_duel else R.string.loading_optimizing,
                                uiState.generationAttempts
                            ),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                    }
                }

                if (speechText != null) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.End
                    ) {
                        Card(
                            shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 0.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF9C4)), // Cheerful yellow parchment color
                            modifier = Modifier.weight(1f).padding(end = 12.dp, bottom = 16.dp),
                            elevation = CardDefaults.cardElevation(4.dp)
                        ) {
                            Text(
                                text = speechText,
                                modifier = Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodyLarge,
                                color = Color.Black,
                                fontWeight = FontWeight.Medium
                            )
                        }

                        val portraitResId = R.drawable.mission_goodmove01

                        Image(
                            painter = painterResource(id = portraitResId),
                            contentDescription = "Portrait",
                            modifier = Modifier.size(90.dp)
                        )
                    }
                }

                // Button Area
                if (uiState.isGameOver || uiState.isSurvivalGoalReached) {
                    Button(
                        onClick = { viewModel.startMission(uiState.currentMission, currentElo) },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50), contentColor = Color.White),
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp)
                    ) {
                        Text(stringResource(R.string.next_position))
                    }
                } else if (!uiState.isDuel) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { viewModel.onRequestHint() },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFCD853F), contentColor = Color.White),
                            enabled = !uiState.isEngineThinking,
                            modifier = Modifier.weight(1f)
                        ) { Text(stringResource(R.string.hint)) }
                        
                        Button(
                            onClick = { viewModel.startMission(uiState.currentMission, currentElo) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF5D4037), contentColor = Color.White),
                            enabled = !uiState.isEngineThinking,
                            modifier = Modifier.weight(1f)
                        ) { Text(stringResource(R.string.skip)) }
                    }
                }
                
                Button(
                    onClick = onBack,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8B4513), contentColor = Color.White),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp)
                ) {
                    Text(stringResource(R.string.btn_back))
                }
                
                // Tutorial Button (Question Mark) - Top Right overlay style within the Column's top if possible
                // Actually, let's put it as an overlay in the Box
                
                // Extra Spacer at the bottom to ensure scrolling works and content isnt cut off
                Spacer(modifier = Modifier.height(48.dp))
            }
        }

        // Tutorial Button - Top Right Overlay
        // Check if tutorial exists
        val hasTutorial = remember(uiState.currentMission) {
            de.magicfoxstudios.chesstrainer.domain.TutorialRepository.getTutorial(uiState.currentMission) != null
        }

        if (hasTutorial) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 8.dp, end = 8.dp)
            ) {
                // Reuse the same style as HomeScreen or similar
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clickable { onOpenTutorial() },
                    contentAlignment = Alignment.Center
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.button_background),
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize()
                    )
                    Image(
                        painter = painterResource(id = R.drawable.icon_help),
                        contentDescription = "Tutorial",
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }

        // Overlay is drawn on top of Scaffold
        currentAnimationType?.let { isWin ->
            val buildingId = uiState.currentMission.substringAfter("duel_")
            val villainResId = if (uiState.isDuel) {
                when (buildingId) {
                    "SCHOOL" -> if (isWin) R.drawable.opponent_school_lost else R.drawable.opponent_school
                    "BARBER" -> if (isWin) R.drawable.opponent_barber_lost else R.drawable.opponent_barber
                    "HORSES" -> if (isWin) R.drawable.opponent_horses_lost else R.drawable.opponent_horses
                    "SMITHY" -> if (isWin) R.drawable.opponent_smithy_lost else R.drawable.opponent_smithy
                    "WINDMILL" -> if (isWin) R.drawable.opponent_windmill_lost else R.drawable.opponent_windmill
                    "DOCTOR" -> if (isWin) R.drawable.opponent_doctor_lost else R.drawable.opponent_doctor
                    "WORKSHOP" -> if (isWin) R.drawable.opponent_workshop_lost else R.drawable.opponent_workshop
                    "SALOON" -> if (isWin) R.drawable.opponent_saloon_lost else R.drawable.opponent_saloon
                    "COURT" -> if (isWin) R.drawable.opponent_court_lost else R.drawable.opponent_court
                    // "BANK" -> if (isWin) R.drawable.opponent_barber_lost else R.drawable.opponent_barber // Placeholder
                    // "JAIL" -> if (isWin) R.drawable.opponent_smithy_lost else R.drawable.opponent_smithy // Placeholder
                    // "STAGECOACH" -> if (isWin) R.drawable.opponent_windmill_lost else R.drawable.opponent_windmill // Placeholder
                    else -> if (isWin) R.drawable.opponent_school_lost else R.drawable.opponent_school
                }
            } else null

            ResultAnimationOverlay(
                isWin = isWin,
                text = currentAnimationText,
                villainResId = villainResId,
                onAnimationEnd = { currentAnimationType = null }
            )
        }

        if (uiState.isPromotionDialogVisible) {
            PromotionDialog(
                onPieceSelected = { viewModel.onPromotionSelected(it) },
                onDismiss = { viewModel.onCancelPromotion() },
                isComicStyle = isComicStyleEnabled
            )
        }

        if (uiState.isNetworkError) {
            NetworkErrorOverlay(
                isJailUnlocked = isJailUnlocked,
                onRetry = { viewModel.startMission(uiState.currentMission, currentElo) }
            )
        }

        if (introAnimationState != IntroAnimationState.FINISHED) {
            VillainIntroOverlay(
                missionId = uiState.currentMission,
                introAnimationState = introAnimationState,
                isEngineThinking = uiState.isEngineThinking,
                generationAttempts = uiState.generationAttempts,
                horseIndex = horseAnimationIndex,
                onStateChange = { newState ->
                    introAnimationState = newState
                }
            )
        }
    }
}

@Composable
fun VillainIntroOverlay(
    missionId: String,
    introAnimationState: IntroAnimationState,
    isEngineThinking: Boolean,
    generationAttempts: Int,
    horseIndex: Int,
    onStateChange: (IntroAnimationState) -> Unit
) {
    val context = LocalContext.current
    val isDuel = missionId.startsWith("duel_")
    
    val villainId = if (isDuel) {
        val buildingId = missionId.substringAfter("duel_").lowercase(java.util.Locale.ROOT)
        "villain_$buildingId"
    } else {
        "horse_dancing$horseIndex"
    }

    val fallbackSheet = if (isDuel) R.drawable.villain_school_sheet else R.drawable.horse_dancing1_sheet
    val fallbackAudio = if (isDuel) R.raw.villain_school else R.raw.horse_dancing1

    val sheetResId = context.resources.getIdentifier("${villainId}_sheet", "drawable", context.packageName).takeIf { it != 0 } ?: fallbackSheet
    val audioResId = context.resources.getIdentifier(villainId, "raw", context.packageName).takeIf { it != 0 } ?: fallbackAudio

    val imageBitmap = ImageBitmap.imageResource(id = sheetResId)
    val cols: Int
    val rows: Int
    val frameCount: Int

    if (villainId.startsWith("villain_") || villainId.startsWith("horse_dancing") || sheetResId == fallbackSheet) {
        cols = 6
        rows = 11
        frameCount = 64 // 6 columns x 11 rows, but only 64 actual frames (last row has 4)
    } else if (imageBitmap.width > imageBitmap.height) {
        cols = imageBitmap.width / imageBitmap.height
        rows = 1
        frameCount = cols * rows
    } else {
        cols = 1
        rows = imageBitmap.height / imageBitmap.width
        frameCount = cols * rows
    }

    val frameWidth = imageBitmap.width / cols
    val frameHeight = imageBitmap.height / rows
    
    var currentFrame by remember { mutableIntStateOf(0) }
    var animationDone by remember { mutableStateOf(false) }

    val currentIsEngineThinking by rememberUpdatedState(isEngineThinking)

    LaunchedEffect(introAnimationState) {
        if (introAnimationState == IntroAnimationState.PLAYING) {
            var loopCount = 0
            do {
                val mediaPlayer = MediaPlayer.create(context, audioResId)
                val duration = mediaPlayer?.duration ?: 3000
                mediaPlayer?.start()
                
                val frameDuration = (duration / kotlin.math.max(1, frameCount).toLong()).coerceAtLeast(30L)
                for (i in 0 until frameCount) {
                    currentFrame = i
                    delay(frameDuration)
                    
                    // Break out early if we are not in a duel OR if we are repeating and the engine is done
                    if ((loopCount > 0 || !isDuel) && !currentIsEngineThinking) break
                }
                
                if ((loopCount > 0 || !isDuel) && !currentIsEngineThinking) {
                    try {
                        if (mediaPlayer?.isPlaying == true) mediaPlayer.stop()
                    } catch (e: Exception) { }
                    mediaPlayer?.release()
                    break
                }
                
                while (mediaPlayer?.isPlaying == true) {
                    delay(50)
                    if ((loopCount > 0 || !isDuel) && !currentIsEngineThinking) break
                }
                
                try {
                    if (mediaPlayer?.isPlaying == true) mediaPlayer.stop()
                } catch (e: Exception) { }
                mediaPlayer?.release()
                
                loopCount++
            } while (currentIsEngineThinking)
            
            animationDone = true
        }
    }

    LaunchedEffect(animationDone, isEngineThinking, introAnimationState) {
        if (animationDone && !isEngineThinking && introAnimationState == IntroAnimationState.PLAYING) {
            onStateChange(IntroAnimationState.TRANSITIONING)
        }
    }

    LaunchedEffect(introAnimationState) {
        if (introAnimationState == IntroAnimationState.TRANSITIONING) {
            delay(600) // Duration of transition
            onStateChange(IntroAnimationState.FINISHED)
        }
    }

    val transitionProgress by animateFloatAsState(
        targetValue = if (introAnimationState == IntroAnimationState.TRANSITIONING) 1f else 0f,
        animationSpec = tween(600, easing = FastOutSlowInEasing),
        label = "villain_transition"
    )

    val backgroundAlpha by animateFloatAsState(
        targetValue = if (introAnimationState == IntroAnimationState.TRANSITIONING) 0f else 0.75f,
        animationSpec = tween(400),
        label = "bg_alpha"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = backgroundAlpha))
            .pointerInput(Unit) { detectTapGestures { } },
        contentAlignment = Alignment.Center
    ) {
        val configuration = LocalConfiguration.current
        val density = LocalDensity.current

        // For duels, target portrait center is roughly 56dp from right edge, and 144dp from top.
        val dxDp = if (isDuel) (configuration.screenWidthDp / 2f) - 56f else 0f
        val dyDp = if (isDuel) (configuration.screenHeightDp / 2f) - 144f else 0f
        
        val offsetX = with(density) { dxDp.dp.toPx() } * transitionProgress
        val offsetY = -with(density) { dyDp.dp.toPx() } * transitionProgress
        
        // Target portrait size is 80dp. Canvas is 50% of screen width.
        val canvasWidthDp = configuration.screenWidthDp * 0.5f
        val targetScale = if (isDuel) 80f / canvasWidthDp else 0f
        val scale = 1f - ((1f - targetScale) * transitionProgress)
        
        val targetAlphaReduction = if (isDuel) 0.5f else 1f

        Canvas(
            modifier = Modifier
                .fillMaxWidth(0.5f)
                .aspectRatio(1f)
                .graphicsLayer(
                    scaleX = scale,
                    scaleY = scale,
                    translationX = offsetX,
                    translationY = offsetY,
                    alpha = 1f - (targetAlphaReduction * transitionProgress)
                )
        ) {
            val srcX = (currentFrame % cols) * frameWidth
            val srcY = (currentFrame / cols) * frameHeight
            val srcOffset = IntOffset(srcX, srcY)
            val srcSize = IntSize(frameWidth, frameHeight)
            
            val destSize = size.width.toInt()
            val destYOffset = (size.height - destSize) / 2f
            
            drawImage(
                image = imageBitmap,
                srcOffset = srcOffset,
                srcSize = srcSize,
                dstOffset = IntOffset(0, destYOffset.toInt()),
                dstSize = IntSize(destSize, destSize)
            )
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = (configuration.screenWidthDp * 0.25f + 48f).dp)
                .graphicsLayer(alpha = 1f - transitionProgress)
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                color = Color.White
            )
            Spacer(modifier = Modifier.width(16.dp))
            Text(
                text = stringResource(if (isDuel) R.string.loading_preparing_duel else R.string.loading_optimizing, generationAttempts),
                color = Color.White,
                style = MaterialTheme.typography.titleMedium
            )
        }
    }
}

@Composable
fun PromotionDialog(
    onPieceSelected: (Char) -> Unit,
    onDismiss: () -> Unit,
    isComicStyle: Boolean
) {
    val pieces = listOf(
        'Q' to R.string.dialog_promotion_queen,
        'R' to R.string.dialog_promotion_rook,
        'B' to R.string.dialog_promotion_bishop,
        'N' to R.string.dialog_promotion_knight
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.dialog_promotion_title)) },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(24.dp)
            ) {
                // Special large display for the Queen
                PromotionPieceItem(
                    pieceChar = pieces[0].first,
                    label = stringResource(pieces[0].second),
                    isComicStyle = isComicStyle,
                    size = 120.dp,
                    fontSize = 80.sp,
                    onClick = { onPieceSelected(pieces[0].first) }
                )

                // Other pieces in a row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    for (i in 1 until pieces.size) {
                        PromotionPieceItem(
                            pieceChar = pieces[i].first,
                            label = stringResource(pieces[i].second),
                            isComicStyle = isComicStyle,
                            size = 60.dp,
                            fontSize = 40.sp,
                            onClick = { onPieceSelected(pieces[i].first) }
                        )
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.btn_back))
            }
        },
        shape = RoundedCornerShape(24.dp),
        containerColor = MaterialTheme.colorScheme.surface
    )
}

@Composable
fun PromotionPieceItem(
    pieceChar: Char,
    label: String,
    isComicStyle: Boolean,
    size: androidx.compose.ui.unit.Dp,
    fontSize: androidx.compose.ui.unit.TextUnit,
    onClick: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable { onClick() }
    ) {
        Box(
            modifier = Modifier
                .size(size)
                .background(MaterialTheme.colorScheme.secondaryContainer, CircleShape)
                .border(2.dp, MaterialTheme.colorScheme.outline, CircleShape)
                .padding(8.dp),
            contentAlignment = Alignment.Center
        ) {
            if (isComicStyle) {
                val drawableId = getComicPieceDrawable(pieceChar)
                if (drawableId != null) {
                    Image(
                        painter = painterResource(id = drawableId),
                        contentDescription = label,
                        modifier = Modifier.fillMaxSize()
                    )
                }
            } else {
                val pieceSymbol = getPieceSymbol(pieceChar)
                Text(
                    text = pieceSymbol,
                    fontSize = fontSize,
                    color = Color.Black
                )
            }
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}

@Composable
fun ResultAnimationOverlay(
    isWin: Boolean,
    text: String,
    title: String? = null,
    isDraw: Boolean = false,
    villainResId: Int? = null,
    onAnimationEnd: () -> Unit
) {
    var animationTriggered by remember { mutableStateOf(false) }

    val scale by animateFloatAsState(
        targetValue = if (animationTriggered) 1f else 0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "scale"
    )
    
    val alpha by animateFloatAsState(
        targetValue = if (animationTriggered) 1f else 0f,
        animationSpec = tween(500),
        label = "alpha"
    )

    val particlesProgress = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        animationTriggered = true
        particlesProgress.animateTo(
            targetValue = 1f,
            animationSpec = tween(2000, easing = LinearOutSlowInEasing)
        )
        delay(1500)
        animationTriggered = false
        delay(500)
        onAnimationEnd()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = alpha * 0.7f))
            .pointerInput(Unit) {
                detectTapGestures { } // Block clicks underneath briefly
            },
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val center = Offset(size.width / 2, size.height / 2)
            val pProgress = particlesProgress.value
            
            if (pProgress > 0 && pProgress < 1f) {
                val count = if (villainResId != null) 100 else 60
                for (i in 0 until count) {
                    val angle = (i * (360f / count)) * (Math.PI / 180f)
                    val randomOffset = (i % 7) * 0.15f
                    val distance = size.width * (0.3f + randomOffset) * pProgress
                    
                    val x = center.x + (cos(angle) * distance).toFloat()
                    val y = center.y + (sin(angle) * distance).toFloat()
                    
                    val pAlpha = 1f - pProgress
                    
                    val color = if (isDraw) {
                        if (i % 2 == 0) Color(0xFFBDBDBD) else Color(0xFF757575) // Gray for draw
                    } else if (isWin) {
                        if (i % 2 == 0) Color(0xFFFFD700) else Color(0xFF4CAF50)
                    } else {
                        if (i % 2 == 0) Color(0xFFF44336) else if (villainResId != null) Color.Black else Color(0xFF8B4513)
                    }
                    
                    val radius = if (isWin || isDraw) {
                        (18.dp.toPx() * (1f - pProgress)) + 6.dp.toPx()
                    } else {
                        (14.dp.toPx() * (1f - pProgress)) + 4.dp.toPx()
                    }

                    drawCircle(
                        color = color.copy(alpha = pAlpha),
                        radius = radius,
                        center = Offset(x, y)
                    )
                }
            }
        }

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .graphicsLayer(
                    scaleX = scale,
                    scaleY = scale,
                    alpha = alpha
                )
        ) {
            val headerText = title ?: if (isDraw) "REMIS" else if (isWin) stringResource(R.string.animation_win_title) else stringResource(R.string.animation_loss_title)
            val headerColor = if (isDraw) Color(0xFFE0E0E0) else if (isWin) Color(0xFFFFD700) else Color(0xFFF44336)
            val iconRes = villainResId ?: if (isWin) R.drawable.animation_win else R.drawable.animation_loss
            
            Text(
                text = headerText,
                color = headerColor,
                fontSize = 48.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.padding(bottom = 16.dp),
                style = TextStyle(
                    shadow = Shadow(
                        color = Color.Black.copy(alpha = 0.8f),
                        offset = Offset(4f, 4f),
                        blurRadius = 8f
                    )
                )
            )
            
            Image(
                painter = painterResource(id = iconRes),
                contentDescription = null,
                modifier = Modifier.size(if (villainResId != null) 280.dp else 200.dp),
                contentScale = ContentScale.Fit
            )
            
            Text(
                text = text,
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 24.dp, start = 32.dp, end = 32.dp),
                style = TextStyle(
                    shadow = Shadow(
                        color = Color.Black.copy(alpha = 0.8f),
                        offset = Offset(2f, 2f),
                        blurRadius = 4f
                    )
                )
            )
        }
    }
}

@Composable
fun DifficultyDebugBar(
    evaluation: RewardEvaluation,
    currentElo: Int,
    modifier: Modifier = Modifier
) {
    // Animationen für weiche Übergänge beim Wechsel der Position
    val animatedProgress by animateFloatAsState(
        targetValue = evaluation.difficultyFactor,
        label = "difficulty_progress"
    )
    
    val barColor by animateColorAsState(
        targetValue = when {
            evaluation.difficultyFactor <= 0.4f -> Color(0xFF4CAF50) // Leicht: Grün
            evaluation.difficultyFactor <= 0.8f -> Color(0xFFFF9800) // Mittel: Orange
            else -> Color(0xFFF44336)                                 // Schwer: Rot
        },
        label = "difficulty_color"
    )

    Card(
        modifier = modifier
            .fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = stringResource(R.string.debug_mate_info, evaluation.movesToMate, evaluation.puzzleElo),
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Horizontale Skala
            LinearProgressIndicator(
                progress = { animatedProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(10.dp)
                    .clip(RoundedCornerShape(5.dp)),
                color = barColor,
                trackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f)
            )

            Spacer(modifier = Modifier.height(12.dp))

            val expectedScore = 1.0 / (1.0 + 10.0.pow((evaluation.puzzleElo - currentElo) / 400.0))
            val kFactor = 32.0
            val expectedGain = (kFactor * (1.0 - expectedScore)).toInt().coerceAtLeast(0)
            val expectedLoss = kotlin.math.abs(kFactor * (0.0 - expectedScore)).toInt().coerceAtLeast(0)

            // Belohnungs-Vorschau
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                RewardText("💰 Gold: +${evaluation.expectedGoldGain}", Color(0xFFB8860B))
                RewardText("📈 +$expectedGain ELO", Color(0xFF4CAF50))
                RewardText("📉 -$expectedLoss ELO", Color(0xFFF44336))
            }
        }
    }
}

@Composable
fun DuelGoldDisplay(
    goldAmount: Int,
    eloAmount: Int,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFD700).copy(alpha = 0.15f)),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(2.dp, Color(0xFFFFD700))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "💰",
                fontSize = 32.sp
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "BELOHNUNG",
                    style = MaterialTheme.typography.labelLarge,
                    color = Color(0xFFB8860B),
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "+$goldAmount GOLD" + (if (eloAmount > 0) " / +$eloAmount ELO" else ""),
                    style = MaterialTheme.typography.headlineMedium,
                    color = Color(0xFFB8860B),
                    fontWeight = FontWeight.Black
                )
            }
        }
    }
}

@Composable
private fun RewardText(text: String, color: Color) {
    Text(
        text = text,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = color
    )
}

fun getPieceSymbol(c: Char): String {
    // We intentionally map EVERYTHING to the solid Unicode pieces
    // to give them a cute, token-like appearance with stroke & fill
    return when (c.uppercaseChar()) {
        'K' -> "♚"
        'Q' -> "♛"
        'R' -> "♜"
        'B' -> "♝"
        'N' -> "♞"
        'P' -> "♟"
        else -> ""
    }
}