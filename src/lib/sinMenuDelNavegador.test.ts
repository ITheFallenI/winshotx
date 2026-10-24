import { describe, expect, it } from "vitest";
import { esEditable, quitarMenuDelNavegador } from "./sinMenuDelNavegador";

function clicDerecho(objetivo: Element): boolean {
  const evento = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  objetivo.dispatchEvent(evento);
  return evento.defaultPrevented;
}

describe("el menu del navegador", () => {
  it("no sale en la ventana, que es donde salia «Compartir»", () => {
    const quitar = quitarMenuDelNavegador();
    const boton = document.createElement("button");
    document.body.append(boton);
    expect(clicDerecho(boton)).toBe(true);
    expect(clicDerecho(document.body)).toBe(true);
    boton.remove();
    quitar();
  });

  it("pero si en los campos de texto, para cortar, copiar y pegar", () => {
    const quitar = quitarMenuDelNavegador();
    const campo = document.createElement("input");
    document.body.append(campo);
    expect(clicDerecho(campo)).toBe(false);
    campo.remove();
    quitar();
  });

  it("un campo de solo lectura o una casilla no cuentan como texto", () => {
    const soloLectura = document.createElement("input");
    soloLectura.readOnly = true;
    const casilla = document.createElement("input");
    casilla.type = "checkbox";
    expect(esEditable(soloLectura)).toBe(false);
    expect(esEditable(casilla)).toBe(false);
    expect(esEditable(document.createElement("textarea"))).toBe(true);
  });
});
