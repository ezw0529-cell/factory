extends Node2D

const OBSTACLE_SCENE := preload("res://scenes/obstacle.tscn")

const SPAWN_MIN := 0.9
const SPAWN_MAX := 1.8
const GROUND_Y := 1100.0
const SPAWN_X := 900.0

@onready var player: CharacterBody2D = $Player
@onready var score_label: Label = $UI/ScoreLabel
@onready var game_over_panel: Control = $UI/GameOverPanel
@onready var final_score_label: Label = $UI/GameOverPanel/VBox/FinalScore
@onready var restart_button: Button = $UI/GameOverPanel/VBox/RestartButton
@onready var spawn_timer: Timer = $SpawnTimer
@onready var speed_timer: Timer = $SpeedTimer

var score := 0
var obstacle_speed := 600.0
var game_running := true


func _ready() -> void:
	randomize()
	player.died.connect(_on_player_died)
	spawn_timer.timeout.connect(_spawn_obstacle)
	speed_timer.timeout.connect(_increase_speed)
	restart_button.pressed.connect(_restart)
	game_over_panel.visible = false
	_schedule_next_spawn()


func _schedule_next_spawn() -> void:
	spawn_timer.wait_time = randf_range(SPAWN_MIN, SPAWN_MAX) * (600.0 / obstacle_speed)
	spawn_timer.start()


func _spawn_obstacle() -> void:
	if not game_running:
		return
	var ob := OBSTACLE_SCENE.instantiate()
	ob.position = Vector2(SPAWN_X, GROUND_Y)
	ob.speed = obstacle_speed
	ob.passed_player.connect(_on_obstacle_passed)
	add_child(ob)
	_schedule_next_spawn()


func _on_obstacle_passed() -> void:
	score += 1
	score_label.text = "점수 %d" % score


func _increase_speed() -> void:
	obstacle_speed = min(obstacle_speed + 30.0, 1400.0)


func _on_player_died() -> void:
	game_running = false
	spawn_timer.stop()
	speed_timer.stop()
	final_score_label.text = "점수 %d" % score
	game_over_panel.visible = true


func _restart() -> void:
	get_tree().reload_current_scene()
