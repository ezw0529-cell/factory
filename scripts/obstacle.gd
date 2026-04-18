extends Area2D

@export var speed := 600.0

var passed := false

signal passed_player


func _physics_process(delta: float) -> void:
	position.x -= speed * delta
	if position.x < -200:
		queue_free()
	if not passed and position.x < 200:
		passed = true
		passed_player.emit()


func _on_body_entered(body: Node2D) -> void:
	if body.has_method("die"):
		body.die()
