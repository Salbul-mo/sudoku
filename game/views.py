from django.http import JsonResponse
from django.shortcuts import render

from . import generator


def index(request):
    return render(request, "game/index.html")


def new_puzzle(request):
    puzzle, solution = generator.generate_puzzle()
    return JsonResponse({"puzzle": puzzle, "solution": solution})
