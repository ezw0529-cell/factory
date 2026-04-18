extends CharacterBody2D

const GRAVITY := 2800.0
const JUMP_VELOCITY := -1100.0
const DOUBLE_JUMP_VELOCITY := -950.0
const MAX_JUMPS := 2

signal died

var jumps_remaining := MAX_JUMPS
var is_dead := false


func _physics_process(delta: float) -> void:
	velocity.y += GRAVITY * delta
	if not is_dead and is_on_floor():
		jumps_remaining = MAX_JUMPS
	move_and_slide()


func _unhandled_input(event: InputEvent) -> void:
	if is_dead:
		return
	var jump_pressed := false
	if event is InputEventScreenTouch and event.pressed and not event.canceled:
		jump_pressed = true
	elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_SPACE:
		jump_pressed = true
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		jump_pressed = true

	if jump_pressed and jumps_remaining > 0:
		velocity.y = JUMP_VELOCITY if jumps_remaining == MAX_JUMPS else DOUBLE_JUMP_VELOCITY
		jumps_remaining -= 1


func die() -> void:
	if is_dead:
		return
	is_dead = true
	velocity = Vector2(-200, -800)
	collision_layer = 0
	collision_mask = 1
	died.emit()
