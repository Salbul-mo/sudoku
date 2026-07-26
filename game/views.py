from django.http import JsonResponse
from django.shortcuts import render

from . import generator


def index(request):
    puzzle, solution = generator.generate_puzzle()
    return render(request, "game/index.html", {
        "puzzle": puzzle,
        "solution": solution,
    })


def new_puzzle(request):
    puzzle, solution = generator.generate_puzzle()
    return JsonResponse({"puzzle": puzzle, "solution": solution})
