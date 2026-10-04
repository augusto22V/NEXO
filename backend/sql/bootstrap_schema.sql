--
-- PostgreSQL database dump
--

\restrict FFjZWo2m6jTDOopeZUtbHbwvrbVoJz5d5TUYMuWQLokcIVBnItzB9UmzMqIQHLO

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: fn_auditoria_dml(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_auditoria_dml() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
      DECLARE
        v_usuario_id integer;
        v_pk_col text;
        v_registro_id text;
        v_old jsonb;
        v_new jsonb;
      BEGIN
        IF TG_TABLE_NAME = 'auditoria' THEN
          RETURN COALESCE(NEW, OLD);
        END IF;

        BEGIN
          v_usuario_id := NULLIF(current_setting('app.user_id', true), '')::integer;
        EXCEPTION
          WHEN others THEN
            v_usuario_id := NULL;
        END;

        SELECT a.attname
          INTO v_pk_col
        FROM pg_index i
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid
         AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = TG_RELID
          AND i.indisprimary
        ORDER BY a.attnum
        LIMIT 1;

        IF TG_OP = 'INSERT' THEN
          v_new := to_jsonb(NEW);
          v_registro_id := COALESCE(v_new ->> v_pk_col, NULL);
          v_usuario_id := COALESCE(
            v_usuario_id,
            CASE
              WHEN COALESCE(v_new ->> 'usuario_id', '') ~ '^[0-9]+$'
                THEN (v_new ->> 'usuario_id')::integer
              ELSE NULL
            END
          );

          INSERT INTO public.auditoria (tabla, registro_id, accion, usuario_id, datos_nuevos)
          VALUES (TG_TABLE_NAME, v_registro_id::varchar(80), 'INSERT', v_usuario_id, v_new);
          RETURN NEW;
        END IF;

        IF TG_OP = 'UPDATE' THEN
          v_old := to_jsonb(OLD);
          v_new := to_jsonb(NEW);

          IF v_old = v_new THEN
            RETURN NEW;
          END IF;

          v_registro_id := COALESCE(v_new ->> v_pk_col, v_old ->> v_pk_col, NULL);
          v_usuario_id := COALESCE(
            v_usuario_id,
            CASE
              WHEN COALESCE(v_new ->> 'usuario_id', '') ~ '^[0-9]+$'
                THEN (v_new ->> 'usuario_id')::integer
              ELSE NULL
            END,
            CASE
              WHEN COALESCE(v_old ->> 'usuario_id', '') ~ '^[0-9]+$'
                THEN (v_old ->> 'usuario_id')::integer
              ELSE NULL
            END
          );

          INSERT INTO public.auditoria (tabla, registro_id, accion, usuario_id, datos_anteriores, datos_nuevos)
          VALUES (TG_TABLE_NAME, v_registro_id::varchar(80), 'UPDATE', v_usuario_id, v_old, v_new);
          RETURN NEW;
        END IF;

        v_old := to_jsonb(OLD);
        v_registro_id := COALESCE(v_old ->> v_pk_col, NULL);
        v_usuario_id := COALESCE(
          v_usuario_id,
          CASE
            WHEN COALESCE(v_old ->> 'usuario_id', '') ~ '^[0-9]+$'
              THEN (v_old ->> 'usuario_id')::integer
            ELSE NULL
          END
        );

        INSERT INTO public.auditoria (tabla, registro_id, accion, usuario_id, datos_anteriores)
        VALUES (TG_TABLE_NAME, v_registro_id::varchar(80), 'DELETE', v_usuario_id, v_old);

        RETURN OLD;
      END;
      $_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria (
    id bigint NOT NULL,
    tabla character varying(120) NOT NULL,
    registro_id character varying(80),
    accion character varying(10) NOT NULL,
    usuario_id integer,
    datos_anteriores jsonb,
    datos_nuevos jsonb,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auditoria_accion_check CHECK (((accion)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[])))
);


--
-- Name: auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditoria_id_seq OWNED BY public.auditoria.id;


--
-- Name: caja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja (
    id bigint NOT NULL,
    empresa_id bigint,
    terminal_id bigint,
    estado character varying(20) DEFAULT 'ABIERTA'::character varying NOT NULL,
    fecha_apertura timestamp with time zone DEFAULT now(),
    fecha_cierre timestamp with time zone,
    monto_inicial numeric(18,6) DEFAULT 0,
    monto_inicial_real numeric(18,6) DEFAULT 0,
    monto_inicial_dolar numeric(18,6) DEFAULT 0,
    fecha timestamp with time zone DEFAULT now(),
    usuario_id bigint,
    cotizacion_real numeric(18,4) DEFAULT 0,
    cotizacion_dolar numeric(18,4) DEFAULT 0,
    monto_final numeric(18,2) DEFAULT 0,
    monto_final_real numeric(12,2) DEFAULT 0,
    monto_final_dolar numeric(12,2) DEFAULT 0
);


--
-- Name: caja_arqueo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_arqueo (
    id bigint NOT NULL,
    caja_id bigint NOT NULL,
    caja_sesion_id bigint,
    terminal_id bigint,
    usuario_id bigint,
    contado_gs numeric(18,6) DEFAULT 0 NOT NULL,
    contado_brl numeric(18,6) DEFAULT 0 NOT NULL,
    contado_usd numeric(18,6) DEFAULT 0 NOT NULL,
    contado_tarjeta numeric(18,6) DEFAULT 0 NOT NULL,
    contado_transferencia numeric(18,6) DEFAULT 0 NOT NULL,
    contado_pix numeric(18,6) DEFAULT 0 NOT NULL,
    esperado_gs numeric(18,6) DEFAULT 0 NOT NULL,
    esperado_brl numeric(18,6) DEFAULT 0 NOT NULL,
    esperado_usd numeric(18,6) DEFAULT 0 NOT NULL,
    esperado_tarjeta numeric(18,6) DEFAULT 0 NOT NULL,
    esperado_transferencia numeric(18,6) DEFAULT 0 NOT NULL,
    esperado_pix numeric(18,6) DEFAULT 0 NOT NULL,
    diferencia_gs numeric(18,6) DEFAULT 0 NOT NULL,
    diferencia_brl numeric(18,6) DEFAULT 0 NOT NULL,
    diferencia_usd numeric(18,6) DEFAULT 0 NOT NULL,
    diferencia_tarjeta numeric(18,6) DEFAULT 0 NOT NULL,
    diferencia_transferencia numeric(18,6) DEFAULT 0 NOT NULL,
    diferencia_pix numeric(18,6) DEFAULT 0 NOT NULL,
    observacion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: caja_arqueo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.caja_arqueo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: caja_arqueo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.caja_arqueo_id_seq OWNED BY public.caja_arqueo.id;


--
-- Name: caja_historial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_historial (
    id bigint NOT NULL,
    fecha timestamp without time zone DEFAULT now(),
    caja_id bigint,
    sesion_id bigint,
    terminal_id bigint,
    empresa_id bigint,
    usuario_id bigint,
    origen character varying(30),
    operacion character varying(10),
    moneda character varying(10),
    monto numeric(14,2) DEFAULT 0,
    tipo_id bigint,
    tipo_nombre character varying(120),
    documento character varying(120),
    referencia_id bigint,
    observacion text
);


--
-- Name: caja_historial_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.caja_historial_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: caja_historial_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.caja_historial_id_seq OWNED BY public.caja_historial.id;


--
-- Name: caja_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.caja_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: caja_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.caja_id_seq OWNED BY public.caja.id;


--
-- Name: caja_movimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_movimiento (
    id bigint NOT NULL,
    caja_id bigint NOT NULL,
    venta_id bigint,
    total_venta numeric(18,6) DEFAULT 0 NOT NULL,
    pago_efectivo numeric(18,6) DEFAULT 0,
    pago_efectivo_real numeric(18,6) DEFAULT 0,
    pago_efectivo_dolar numeric(18,6) DEFAULT 0,
    cotizacion_real numeric(18,6) DEFAULT 0,
    cotizacion_dolar numeric(18,6) DEFAULT 0,
    pago_tarjeta numeric(18,6) DEFAULT 0,
    pago_transferencia numeric(18,6) DEFAULT 0,
    pago_pix numeric(18,6) DEFAULT 0,
    vuelto numeric(18,6) DEFAULT 0,
    vuelto_real numeric(18,6) DEFAULT 0,
    vuelto_dolar numeric(18,6) DEFAULT 0,
    usuario_id bigint,
    caja_sesion_id bigint,
    creado_en timestamp with time zone DEFAULT now(),
    fecha timestamp with time zone DEFAULT now()
);


--
-- Name: caja_movimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.caja_movimiento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: caja_movimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.caja_movimiento_id_seq OWNED BY public.caja_movimiento.id;


--
-- Name: caja_movimiento_manual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_movimiento_manual (
    id bigint NOT NULL,
    caja_id bigint NOT NULL,
    caja_sesion_id bigint,
    terminal_id bigint,
    usuario_id bigint,
    tipo_movimiento_id bigint,
    tipo_movimiento_nombre character varying(120) NOT NULL,
    naturaleza character varying(10) NOT NULL,
    moneda_id integer NOT NULL,
    monto numeric(18,6) DEFAULT 0 NOT NULL,
    monto_gs numeric(18,6) DEFAULT 0 NOT NULL,
    cotizacion_brl numeric(18,6),
    cotizacion_usd numeric(18,6),
    observacion text,
    documento character varying(120),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caja_movimiento_manual_moneda_id_check CHECK ((moneda_id = ANY (ARRAY[1, 2, 3]))),
    CONSTRAINT caja_movimiento_manual_naturaleza_check CHECK (((naturaleza)::text = ANY ((ARRAY['ENTRADA'::character varying, 'SALIDA'::character varying])::text[])))
);


--
-- Name: caja_movimiento_manual_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.caja_movimiento_manual_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: caja_movimiento_manual_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.caja_movimiento_manual_id_seq OWNED BY public.caja_movimiento_manual.id;


--
-- Name: caja_movimiento_tipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_movimiento_tipo (
    id bigint NOT NULL,
    nombre character varying(120) NOT NULL,
    naturaleza character varying(10) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caja_movimiento_tipo_naturaleza_check CHECK (((naturaleza)::text = ANY ((ARRAY['ENTRADA'::character varying, 'SALIDA'::character varying])::text[])))
);


--
-- Name: caja_movimiento_tipo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.caja_movimiento_tipo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: caja_movimiento_tipo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.caja_movimiento_tipo_id_seq OWNED BY public.caja_movimiento_tipo.id;


--
-- Name: caja_pago_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_pago_detalle (
    id bigint NOT NULL,
    caja_movimiento_id bigint NOT NULL,
    metodo character varying(30) NOT NULL,
    moneda character varying(10) NOT NULL,
    monto numeric(18,6) DEFAULT 0 NOT NULL,
    monto_gs numeric(18,6) DEFAULT 0 NOT NULL
);


--
-- Name: caja_pago_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.caja_pago_detalle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: caja_pago_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.caja_pago_detalle_id_seq OWNED BY public.caja_pago_detalle.id;


--
-- Name: caja_sesiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caja_sesiones (
    id bigint NOT NULL,
    caja_id bigint NOT NULL,
    usuario_id bigint,
    estado character varying(20) DEFAULT 'ABIERTA'::character varying NOT NULL,
    fecha_inicio timestamp with time zone DEFAULT now(),
    fecha_fin timestamp with time zone,
    terminal_id bigint,
    usuario_cierre bigint,
    monto_apertura_real numeric(12,2) DEFAULT 0,
    monto_apertura_dolar numeric(12,2) DEFAULT 0,
    fecha_apertura timestamp with time zone,
    fecha_cierre timestamp with time zone,
    monto_apertura numeric(12,2) DEFAULT 0,
    cotizacion_real numeric(18,6),
    cotizacion_dolar numeric(18,6),
    usuario_apertura bigint,
    observacion text,
    monto_contado numeric(12,2),
    monto_contado_real numeric(12,2),
    monto_contado_dolar numeric(12,2),
    diferencia numeric(12,2),
    diferencia_real numeric(12,2),
    diferencia_dolar numeric(12,2),
    total_ventas numeric(14,2)
);


--
-- Name: caja_sesiones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.caja_sesiones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: caja_sesiones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.caja_sesiones_id_seq OWNED BY public.caja_sesiones.id;


--
-- Name: categoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categoria (
    id integer NOT NULL,
    nombre character varying(120) NOT NULL,
    imagen character varying(255),
    orden_pantalla integer DEFAULT 0,
    orden_venta_medio integer DEFAULT 0,
    mostrar_venta_medio boolean DEFAULT true NOT NULL,
    mostrar_menu_digital boolean DEFAULT true NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: categoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categoria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categoria_id_seq OWNED BY public.categoria.id;


--
-- Name: cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente (
    id bigint NOT NULL,
    nombre character varying(120) NOT NULL,
    ruc character varying(30),
    direccion character varying(200),
    telefono character varying(50),
    activo boolean DEFAULT true NOT NULL,
    numero_documento character varying(30),
    dv character varying(2),
    tipo_documento character varying(30),
    naturaleza character varying(20),
    tipo_contribuyente character varying(30),
    departamento_id integer,
    distrito_id integer,
    ciudad_id integer,
    numero_casa character varying(30),
    razon_social character varying(200),
    email character varying(150)
);


--
-- Name: cliente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cliente_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cliente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cliente_id_seq OWNED BY public.cliente.id;


--
-- Name: compra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compra (
    id bigint NOT NULL,
    empresa_id bigint,
    fecha date DEFAULT CURRENT_DATE,
    proveedor_id bigint,
    comprador_id bigint,
    condicion_pago_id integer,
    moneda_id integer DEFAULT 1,
    estado character varying(30) DEFAULT 'PENDIENTE'::character varying,
    total numeric(18,6) DEFAULT 0,
    movimiento character varying(30) DEFAULT 'COMPRA'::character varying,
    tipo_operacion_id integer,
    numero_compra bigint,
    usuario_id bigint,
    fecha_emision timestamp with time zone DEFAULT now(),
    actualizado_en timestamp with time zone DEFAULT now(),
    nro_comprobante character varying(100),
    timbrado character varying(50)
);


--
-- Name: compra_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compra_detalle (
    id bigint NOT NULL,
    compra_id bigint NOT NULL,
    producto_id integer NOT NULL,
    cantidad numeric(18,6) DEFAULT 1 NOT NULL,
    costo numeric(18,6) DEFAULT 0 NOT NULL,
    total numeric(18,6) DEFAULT 0 NOT NULL,
    lote character varying(120),
    fecha_vencimiento date,
    costo_original numeric(18,6),
    moneda_id integer,
    costo_moneda_origen numeric(18,6),
    costo_gs numeric(18,6),
    costo_brl numeric(18,6),
    costo_usd numeric(18,6),
    cotizacion_id integer
);


--
-- Name: compra_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compra_detalle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compra_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compra_detalle_id_seq OWNED BY public.compra_detalle.id;


--
-- Name: compra_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compra_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compra_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compra_id_seq OWNED BY public.compra.id;


--
-- Name: comprador; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comprador (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: comprador_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comprador_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comprador_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comprador_id_seq OWNED BY public.comprador.id;


--
-- Name: condicion_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.condicion_pago (
    id integer NOT NULL,
    codigo character varying(20),
    descripcion character varying(80) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    cuotas integer DEFAULT 1,
    dias_intervalo integer DEFAULT 0
);


--
-- Name: condicion_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.condicion_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: condicion_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.condicion_pago_id_seq OWNED BY public.condicion_pago.id;


--
-- Name: config_feature_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_feature_catalog (
    feature_key character varying(80) NOT NULL,
    scope character varying(20) NOT NULL,
    nombre character varying(120) NOT NULL,
    descripcion text,
    default_enabled boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    legacy_column character varying(120),
    depends_on character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT config_feature_catalog_scope_check CHECK (((scope)::text = ANY ((ARRAY['USUARIO'::character varying, 'TERMINAL'::character varying, 'EMPRESA'::character varying])::text[])))
);


--
-- Name: configuracion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion (
    id integer NOT NULL,
    auto_reset_pedidos boolean DEFAULT false,
    hora_reset_pedidos character varying(5) DEFAULT '00:00'::character varying,
    ultimo_reset date,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: configuracion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuracion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuracion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuracion_id_seq OWNED BY public.configuracion.id;


--
-- Name: control_licencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_licencia (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    id_interno bigint NOT NULL,
    fecha_vencimiento date NOT NULL,
    control_actual bigint,
    control_actual_ts timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: control_licencia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.control_licencia_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: control_licencia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.control_licencia_id_seq OWNED BY public.control_licencia.id;


--
-- Name: cotizacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizacion (
    id bigint NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    brl numeric(18,6) DEFAULT 0 NOT NULL,
    usd numeric(18,6) DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    moneda character varying(40),
    valor_indice numeric(18,6) DEFAULT 0 NOT NULL,
    activa boolean DEFAULT true NOT NULL
);


--
-- Name: cotizacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cotizacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cotizacion_id_seq OWNED BY public.cotizacion.id;


--
-- Name: empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa (
    id bigint NOT NULL,
    codigo character varying(20),
    nombre character varying(120) NOT NULL,
    ruc character varying(30),
    direccion character varying(200),
    telefono character varying(50),
    email character varying(120),
    logo character varying(255),
    activa boolean DEFAULT true NOT NULL,
    controlar_lote boolean DEFAULT false NOT NULL,
    moneda_base_id integer DEFAULT 1
);


--
-- Name: empresa_feature_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa_feature_config (
    id bigint NOT NULL,
    empresa_id integer NOT NULL,
    feature_key character varying(80) NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: empresa_feature_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresa_feature_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresa_feature_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresa_feature_config_id_seq OWNED BY public.empresa_feature_config.id;


--
-- Name: empresa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresa_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresa_id_seq OWNED BY public.empresa.id;


--
-- Name: factura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factura (
    id integer NOT NULL,
    venta_id integer,
    numero_factura character varying(50),
    fecha timestamp without time zone DEFAULT now(),
    ruc character varying(30),
    nombre character varying(200),
    direccion character varying(200),
    ciudad character varying(100),
    total numeric(18,2) DEFAULT 0,
    iva_5 numeric(18,2) DEFAULT 0,
    iva_10 numeric(18,2) DEFAULT 0,
    exenta numeric(18,2) DEFAULT 0,
    estado character varying(20) DEFAULT 'ACTIVA'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: factura_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factura_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factura_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factura_id_seq OWNED BY public.factura.id;


--
-- Name: factura_venta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factura_venta (
    factura_id bigint NOT NULL,
    venta_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ia_user_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ia_user_memory (
    user_id bigint NOT NULL,
    ultimo_modulo character varying(20),
    ultimo_cliente character varying(160),
    ultimo_vendedor character varying(160),
    ultimo_tipo_consulta character varying(20),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ia_user_query_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ia_user_query_history (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    consulta_texto text NOT NULL,
    consulta_expandida text,
    interpretacion jsonb DEFAULT '{}'::jsonb NOT NULL,
    contexto_selector character varying(20),
    modulo_aplicado character varying(20),
    tipo_consulta character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ia_user_query_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ia_user_query_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ia_user_query_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ia_user_query_history_id_seq OWNED BY public.ia_user_query_history.id;


--
-- Name: menu_digital_categoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_digital_categoria (
    id bigint NOT NULL,
    menu_id bigint NOT NULL,
    nombre character varying(140) NOT NULL,
    descripcion text,
    color character varying(20) DEFAULT '#147696'::character varying NOT NULL,
    icono character varying(80) DEFAULT 'fa-utensils'::character varying NOT NULL,
    imagen_url text,
    orden integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    visible_publico boolean DEFAULT true NOT NULL,
    agotado boolean DEFAULT false NOT NULL,
    origen_tipo character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    origen_categoria_id integer,
    sincronizado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: menu_digital_categoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menu_digital_categoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menu_digital_categoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menu_digital_categoria_id_seq OWNED BY public.menu_digital_categoria.id;


--
-- Name: menu_digital_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_digital_config (
    id bigint NOT NULL,
    empresa_id integer NOT NULL,
    terminal_id integer NOT NULL,
    slug character varying(160) NOT NULL,
    nombre_publico character varying(180) NOT NULL,
    estado character varying(20) DEFAULT 'BORRADOR'::character varying NOT NULL,
    mensaje_principal text,
    mensaje_secundario text,
    horario_atencion character varying(180),
    datos_contacto text,
    color_principal character varying(20) DEFAULT '#147696'::character varying NOT NULL,
    color_secundario character varying(20) DEFAULT '#E6F1F4'::character varying NOT NULL,
    fondo_tipo character varying(20) DEFAULT 'gradient'::character varying NOT NULL,
    fondo_valor text,
    public_base_url text,
    fondo_imagen_url text,
    banner_url text,
    logo_url text,
    usar_logo_empresa boolean DEFAULT true NOT NULL,
    layout_categorias character varying(20) DEFAULT 'tabs'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: menu_digital_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menu_digital_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menu_digital_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menu_digital_config_id_seq OWNED BY public.menu_digital_config.id;


--
-- Name: menu_digital_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_digital_item (
    id bigint NOT NULL,
    menu_id bigint NOT NULL,
    categoria_id bigint,
    nombre character varying(180) NOT NULL,
    descripcion text,
    precio numeric(14,2) DEFAULT 0 NOT NULL,
    imagen_url text,
    disponible boolean DEFAULT true NOT NULL,
    visible_publico boolean DEFAULT true NOT NULL,
    destacado boolean DEFAULT false NOT NULL,
    agotado boolean DEFAULT false NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    origen_tipo character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    origen_producto_id integer,
    origen_categoria_id integer,
    sincronizado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: menu_digital_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menu_digital_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menu_digital_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menu_digital_item_id_seq OWNED BY public.menu_digital_item.id;


--
-- Name: mesa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mesa (
    id bigint NOT NULL,
    numero character varying(20) NOT NULL,
    estado character varying(20) DEFAULT 'LIBRE'::character varying NOT NULL,
    posicion_x numeric(10,2) DEFAULT 40 NOT NULL,
    posicion_y numeric(10,2) DEFAULT 40 NOT NULL,
    mostrar_en_venta_rapida boolean DEFAULT true NOT NULL,
    venta_id bigint,
    empresa_id bigint DEFAULT 1 NOT NULL,
    terminal_id bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mesa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mesa_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mesa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mesa_id_seq OWNED BY public.mesa.id;


--
-- Name: moneda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moneda (
    id integer NOT NULL,
    nombre character varying(40) NOT NULL,
    simbolo character varying(10) NOT NULL
);


--
-- Name: moneda_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.moneda_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: moneda_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.moneda_id_seq OWNED BY public.moneda.id;


--
-- Name: producto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.producto (
    id integer NOT NULL,
    nombre character varying(180) NOT NULL,
    descripcion text,
    iva_tipo integer DEFAULT 10,
    stock numeric(18,6) DEFAULT 0 NOT NULL,
    categoria_id integer,
    imagen character varying(255),
    unidad_medida character varying(30) DEFAULT 'unidad'::character varying,
    tiempo_preparacion integer DEFAULT 0,
    codigo_barra character varying(80),
    destino_impresion character varying(60),
    efectivacion_directa boolean DEFAULT false NOT NULL,
    no_control_stock boolean DEFAULT false NOT NULL,
    permite_multi_sabor boolean DEFAULT false NOT NULL,
    max_sabores integer DEFAULT 1 NOT NULL,
    facturacion_directa boolean DEFAULT false NOT NULL,
    mostrar_menu_digital boolean DEFAULT true NOT NULL,
    mostrar_venta_medio boolean DEFAULT true NOT NULL,
    orden_venta_medio integer DEFAULT 0 NOT NULL,
    orden_pos integer DEFAULT 0 NOT NULL,
    es_insumo boolean DEFAULT false NOT NULL,
    es_servicio boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: producto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.producto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: producto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.producto_id_seq OWNED BY public.producto.id;


--
-- Name: producto_precio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.producto_precio (
    id bigint NOT NULL,
    producto_id integer NOT NULL,
    precio_compra numeric(18,6) DEFAULT 0 NOT NULL,
    costo_transporte numeric(18,6) DEFAULT 0 NOT NULL,
    precio_venta numeric(18,6) DEFAULT 0 NOT NULL,
    precio_minimo numeric(18,6),
    precio_promocional numeric(18,6),
    activo boolean DEFAULT true NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    precio_compra_moneda_id integer,
    precio_compra_origen numeric(18,6),
    precio_compra_gs numeric(18,6),
    precio_compra_brl numeric(18,6),
    precio_compra_usd numeric(18,6),
    cotizacion_id integer,
    cotizacion_brl numeric(18,6),
    cotizacion_usd numeric(18,6)
);


--
-- Name: producto_precio_cantidad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.producto_precio_cantidad (
    id bigint NOT NULL,
    producto_id integer NOT NULL,
    orden smallint NOT NULL,
    cantidad numeric(18,6),
    porcentaje_valor numeric(9,4),
    valor numeric(18,6),
    actualizado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT producto_precio_cantidad_orden_check CHECK (((orden >= 1) AND (orden <= 4)))
);


--
-- Name: producto_precio_cantidad_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.producto_precio_cantidad_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: producto_precio_cantidad_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.producto_precio_cantidad_id_seq OWNED BY public.producto_precio_cantidad.id;


--
-- Name: producto_precio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.producto_precio_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: producto_precio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.producto_precio_id_seq OWNED BY public.producto_precio.id;


--
-- Name: programas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programas (
    id integer NOT NULL,
    codigo character varying(80) NOT NULL,
    nombre character varying(180) NOT NULL,
    ruta character varying(260) NOT NULL,
    zona character varying(20) DEFAULT 'operativo'::character varying NOT NULL,
    categoria character varying(80) DEFAULT 'General'::character varying NOT NULL,
    icono character varying(80) DEFAULT 'fa-circle'::character varying NOT NULL,
    visible_home boolean DEFAULT false NOT NULL,
    visible_admin boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden_menu integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: programas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.programas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: programas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.programas_id_seq OWNED BY public.programas.id;


--
-- Name: proveedor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedor (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    razon_social character varying(250),
    ruc character varying(40),
    telefono character varying(80),
    direccion character varying(250),
    email character varying(120),
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now(),
    timbrado character varying(20)
);


--
-- Name: proveedor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedor_id_seq OWNED BY public.proveedor.id;


--
-- Name: stock_lote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_lote (
    id integer NOT NULL,
    empresa_id integer NOT NULL,
    producto_id integer NOT NULL,
    lote character varying(120),
    fecha_vencimiento date,
    cantidad numeric(14,3) DEFAULT 0 NOT NULL,
    costo_promedio numeric(14,4) DEFAULT 0 NOT NULL,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_stock_lote_cantidad_non_negative CHECK ((cantidad >= (0)::numeric))
);


--
-- Name: stock_lote_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_lote_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_lote_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_lote_id_seq OWNED BY public.stock_lote.id;


--
-- Name: stock_movimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movimiento (
    id bigint NOT NULL,
    producto_id integer NOT NULL,
    empresa_id bigint,
    tipo character varying(20) NOT NULL,
    cantidad numeric(18,6) NOT NULL,
    costo numeric(18,6) DEFAULT 0,
    referencia_id bigint,
    referencia_tipo character varying(40),
    lote character varying(80),
    fecha_vencimiento date,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_movimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movimiento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movimiento_id_seq OWNED BY public.stock_movimiento.id;


--
-- Name: terminal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.terminal (
    id bigint NOT NULL,
    nombre character varying(80),
    empresa_id bigint,
    activo boolean DEFAULT true NOT NULL,
    tipo_pedido_default_id integer,
    descripcion text,
    tipo character varying(30)
);


--
-- Name: terminal_feature_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.terminal_feature_config (
    id bigint NOT NULL,
    terminal_id integer NOT NULL,
    feature_key character varying(80) NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: terminal_feature_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.terminal_feature_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: terminal_feature_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.terminal_feature_config_id_seq OWNED BY public.terminal_feature_config.id;


--
-- Name: terminal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.terminal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: terminal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.terminal_id_seq OWNED BY public.terminal.id;


--
-- Name: tipo_operacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipo_operacion (
    id bigint NOT NULL,
    codigo integer,
    descripcion character varying(120) NOT NULL,
    tipo character(1) DEFAULT 'S'::bpchar NOT NULL,
    afecta_stock boolean DEFAULT true NOT NULL,
    requiere_confirmacion boolean DEFAULT false NOT NULL,
    genera_financiero boolean DEFAULT true NOT NULL,
    permite_credito boolean DEFAULT false NOT NULL,
    requiere_credito boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: tipo_operacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipo_operacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipo_operacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipo_operacion_id_seq OWNED BY public.tipo_operacion.id;


--
-- Name: tipo_pedido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipo_pedido (
    id_tipo_pedido integer NOT NULL,
    descripcion character varying(80) NOT NULL,
    estado boolean DEFAULT true NOT NULL,
    nombre character varying(80),
    activo boolean DEFAULT true
);


--
-- Name: tipo_pedido_id_tipo_pedido_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipo_pedido_id_tipo_pedido_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipo_pedido_id_tipo_pedido_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipo_pedido_id_tipo_pedido_seq OWNED BY public.tipo_pedido.id_tipo_pedido;


--
-- Name: usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario (
    id bigint NOT NULL,
    usuario character varying(60),
    nombre character varying(120) NOT NULL,
    pass character varying(255),
    rol character varying(40) DEFAULT 'ADMIN'::character varying,
    empresa_id bigint,
    terminal_id bigint,
    activo boolean DEFAULT true NOT NULL,
    modo_factura character varying(30) DEFAULT 'TICKET'::character varying,
    modo_impresion character varying(30) DEFAULT 'NORMAL'::character varying,
    modo_confirmacion character varying(30) DEFAULT 'SI'::character varying,
    password character varying(200),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: usuario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuario_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuario_id_seq OWNED BY public.usuario.id;


--
-- Name: usuario_permiso_accion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario_permiso_accion (
    id bigint NOT NULL,
    usuario_id integer NOT NULL,
    permiso character varying(80) NOT NULL,
    permitido boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usuario_permiso_accion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuario_permiso_accion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuario_permiso_accion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuario_permiso_accion_id_seq OWNED BY public.usuario_permiso_accion.id;


--
-- Name: usuario_programa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario_programa (
    id bigint NOT NULL,
    usuario_id integer NOT NULL,
    programa_id integer,
    rol_snapshot character varying(40),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_usuario_programa_marker CHECK (((programa_id IS NULL) OR (programa_id > 0)))
);


--
-- Name: usuario_programa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuario_programa_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuario_programa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuario_programa_id_seq OWNED BY public.usuario_programa.id;


--
-- Name: vendedor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendedor (
    id bigint NOT NULL,
    nombre character varying(120) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    tipo_calculo_comision character varying(20) DEFAULT 'productos'::character varying,
    tipo_comision character varying(20) DEFAULT 'total_bruto'::character varying,
    porcentaje_ventas numeric(12,2) DEFAULT 0,
    porcentaje_servicios numeric(12,2) DEFAULT 0,
    comision_por_cantidad boolean DEFAULT false
);


--
-- Name: vendedor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendedor_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendedor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendedor_id_seq OWNED BY public.vendedor.id;


--
-- Name: venta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venta (
    id bigint NOT NULL,
    numero bigint,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    pago character varying(30) DEFAULT 'PENDIENTE'::character varying,
    estado character varying(30) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    total numeric(18,6) DEFAULT 0 NOT NULL,
    comision numeric(18,6) DEFAULT 0 NOT NULL,
    vendedor_id bigint,
    cliente_id bigint,
    cliente_nombre character varying(180),
    tipo_pedido_id integer,
    tipo_operacion_id bigint,
    estado_caja character varying(30),
    en_espera_desde timestamp with time zone,
    en_espera_por_usuario_id bigint,
    prioridad_espera smallint DEFAULT 1 NOT NULL,
    nota_espera text,
    empresa_id integer,
    terminal_id integer,
    usuario_id integer,
    efectivizado_en timestamp with time zone
);


--
-- Name: venta_cocina_envio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venta_cocina_envio (
    id bigint NOT NULL,
    request_uuid character varying(80) NOT NULL,
    empresa_id bigint,
    terminal_id bigint,
    venta_id bigint NOT NULL,
    reimprimir boolean DEFAULT false NOT NULL,
    cliente_nombre text,
    estado character varying(20) DEFAULT 'RECIBIDO'::character varying NOT NULL,
    intentos integer DEFAULT 0 NOT NULL,
    ultimo_error text,
    ultimo_resultado jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    procesando_desde timestamp with time zone,
    completado_en timestamp with time zone
);


--
-- Name: venta_cocina_envio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venta_cocina_envio_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venta_cocina_envio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venta_cocina_envio_id_seq OWNED BY public.venta_cocina_envio.id;


--
-- Name: venta_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venta_detalle (
    id bigint NOT NULL,
    venta_id bigint NOT NULL,
    producto_id integer NOT NULL,
    cantidad numeric(18,6) DEFAULT 1 NOT NULL,
    precio numeric(18,6) DEFAULT 0 NOT NULL,
    subtotal numeric(18,6) DEFAULT 0 NOT NULL,
    observacion text,
    precio_moneda_id integer,
    precio_moneda_origen numeric(18,6),
    precio_gs numeric(18,6),
    precio_brl numeric(18,6),
    precio_usd numeric(18,6),
    cotizacion_id integer,
    cotizacion_brl numeric(18,6),
    cotizacion_usd numeric(18,6),
    costo_unitario_gs numeric(14,2)
);


--
-- Name: venta_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venta_detalle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venta_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venta_detalle_id_seq OWNED BY public.venta_detalle.id;


--
-- Name: venta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venta_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venta_id_seq OWNED BY public.venta.id;


--
-- Name: venta_numero_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venta_numero_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria ALTER COLUMN id SET DEFAULT nextval('public.auditoria_id_seq'::regclass);


--
-- Name: caja id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja ALTER COLUMN id SET DEFAULT nextval('public.caja_id_seq'::regclass);


--
-- Name: caja_arqueo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_arqueo ALTER COLUMN id SET DEFAULT nextval('public.caja_arqueo_id_seq'::regclass);


--
-- Name: caja_historial id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_historial ALTER COLUMN id SET DEFAULT nextval('public.caja_historial_id_seq'::regclass);


--
-- Name: caja_movimiento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento ALTER COLUMN id SET DEFAULT nextval('public.caja_movimiento_id_seq'::regclass);


--
-- Name: caja_movimiento_manual id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento_manual ALTER COLUMN id SET DEFAULT nextval('public.caja_movimiento_manual_id_seq'::regclass);


--
-- Name: caja_movimiento_tipo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento_tipo ALTER COLUMN id SET DEFAULT nextval('public.caja_movimiento_tipo_id_seq'::regclass);


--
-- Name: caja_pago_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_pago_detalle ALTER COLUMN id SET DEFAULT nextval('public.caja_pago_detalle_id_seq'::regclass);


--
-- Name: caja_sesiones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_sesiones ALTER COLUMN id SET DEFAULT nextval('public.caja_sesiones_id_seq'::regclass);


--
-- Name: categoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categoria ALTER COLUMN id SET DEFAULT nextval('public.categoria_id_seq'::regclass);


--
-- Name: cliente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente ALTER COLUMN id SET DEFAULT nextval('public.cliente_id_seq'::regclass);


--
-- Name: compra id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra ALTER COLUMN id SET DEFAULT nextval('public.compra_id_seq'::regclass);


--
-- Name: compra_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_detalle ALTER COLUMN id SET DEFAULT nextval('public.compra_detalle_id_seq'::regclass);


--
-- Name: comprador id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprador ALTER COLUMN id SET DEFAULT nextval('public.comprador_id_seq'::regclass);


--
-- Name: condicion_pago id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.condicion_pago ALTER COLUMN id SET DEFAULT nextval('public.condicion_pago_id_seq'::regclass);


--
-- Name: configuracion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion ALTER COLUMN id SET DEFAULT nextval('public.configuracion_id_seq'::regclass);


--
-- Name: control_licencia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_licencia ALTER COLUMN id SET DEFAULT nextval('public.control_licencia_id_seq'::regclass);


--
-- Name: cotizacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion ALTER COLUMN id SET DEFAULT nextval('public.cotizacion_id_seq'::regclass);


--
-- Name: empresa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa ALTER COLUMN id SET DEFAULT nextval('public.empresa_id_seq'::regclass);


--
-- Name: empresa_feature_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_feature_config ALTER COLUMN id SET DEFAULT nextval('public.empresa_feature_config_id_seq'::regclass);


--
-- Name: factura id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura ALTER COLUMN id SET DEFAULT nextval('public.factura_id_seq'::regclass);


--
-- Name: ia_user_query_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_user_query_history ALTER COLUMN id SET DEFAULT nextval('public.ia_user_query_history_id_seq'::regclass);


--
-- Name: menu_digital_categoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_categoria ALTER COLUMN id SET DEFAULT nextval('public.menu_digital_categoria_id_seq'::regclass);


--
-- Name: menu_digital_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_config ALTER COLUMN id SET DEFAULT nextval('public.menu_digital_config_id_seq'::regclass);


--
-- Name: menu_digital_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_item ALTER COLUMN id SET DEFAULT nextval('public.menu_digital_item_id_seq'::regclass);


--
-- Name: mesa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa ALTER COLUMN id SET DEFAULT nextval('public.mesa_id_seq'::regclass);


--
-- Name: moneda id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneda ALTER COLUMN id SET DEFAULT nextval('public.moneda_id_seq'::regclass);


--
-- Name: producto id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto ALTER COLUMN id SET DEFAULT nextval('public.producto_id_seq'::regclass);


--
-- Name: producto_precio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_precio ALTER COLUMN id SET DEFAULT nextval('public.producto_precio_id_seq'::regclass);


--
-- Name: producto_precio_cantidad id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_precio_cantidad ALTER COLUMN id SET DEFAULT nextval('public.producto_precio_cantidad_id_seq'::regclass);


--
-- Name: programas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programas ALTER COLUMN id SET DEFAULT nextval('public.programas_id_seq'::regclass);


--
-- Name: proveedor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedor ALTER COLUMN id SET DEFAULT nextval('public.proveedor_id_seq'::regclass);


--
-- Name: stock_lote id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lote ALTER COLUMN id SET DEFAULT nextval('public.stock_lote_id_seq'::regclass);


--
-- Name: stock_movimiento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movimiento ALTER COLUMN id SET DEFAULT nextval('public.stock_movimiento_id_seq'::regclass);


--
-- Name: terminal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminal ALTER COLUMN id SET DEFAULT nextval('public.terminal_id_seq'::regclass);


--
-- Name: terminal_feature_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminal_feature_config ALTER COLUMN id SET DEFAULT nextval('public.terminal_feature_config_id_seq'::regclass);


--
-- Name: tipo_operacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipo_operacion ALTER COLUMN id SET DEFAULT nextval('public.tipo_operacion_id_seq'::regclass);


--
-- Name: tipo_pedido id_tipo_pedido; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipo_pedido ALTER COLUMN id_tipo_pedido SET DEFAULT nextval('public.tipo_pedido_id_tipo_pedido_seq'::regclass);


--
-- Name: usuario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario ALTER COLUMN id SET DEFAULT nextval('public.usuario_id_seq'::regclass);


--
-- Name: usuario_permiso_accion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_permiso_accion ALTER COLUMN id SET DEFAULT nextval('public.usuario_permiso_accion_id_seq'::regclass);


--
-- Name: usuario_programa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_programa ALTER COLUMN id SET DEFAULT nextval('public.usuario_programa_id_seq'::regclass);


--
-- Name: vendedor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor ALTER COLUMN id SET DEFAULT nextval('public.vendedor_id_seq'::regclass);


--
-- Name: venta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta ALTER COLUMN id SET DEFAULT nextval('public.venta_id_seq'::regclass);


--
-- Name: venta_cocina_envio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_cocina_envio ALTER COLUMN id SET DEFAULT nextval('public.venta_cocina_envio_id_seq'::regclass);


--
-- Name: venta_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_detalle ALTER COLUMN id SET DEFAULT nextval('public.venta_detalle_id_seq'::regclass);


--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);


--
-- Name: caja_arqueo caja_arqueo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_arqueo
    ADD CONSTRAINT caja_arqueo_pkey PRIMARY KEY (id);


--
-- Name: caja_historial caja_historial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_historial
    ADD CONSTRAINT caja_historial_pkey PRIMARY KEY (id);


--
-- Name: caja_movimiento_manual caja_movimiento_manual_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento_manual
    ADD CONSTRAINT caja_movimiento_manual_pkey PRIMARY KEY (id);


--
-- Name: caja_movimiento caja_movimiento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento
    ADD CONSTRAINT caja_movimiento_pkey PRIMARY KEY (id);


--
-- Name: caja_movimiento_tipo caja_movimiento_tipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento_tipo
    ADD CONSTRAINT caja_movimiento_tipo_pkey PRIMARY KEY (id);


--
-- Name: caja_pago_detalle caja_pago_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_pago_detalle
    ADD CONSTRAINT caja_pago_detalle_pkey PRIMARY KEY (id);


--
-- Name: caja caja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja
    ADD CONSTRAINT caja_pkey PRIMARY KEY (id);


--
-- Name: caja_sesiones caja_sesiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_sesiones
    ADD CONSTRAINT caja_sesiones_pkey PRIMARY KEY (id);


--
-- Name: categoria categoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categoria
    ADD CONSTRAINT categoria_pkey PRIMARY KEY (id);


--
-- Name: cliente cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT cliente_pkey PRIMARY KEY (id);


--
-- Name: compra_detalle compra_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_detalle
    ADD CONSTRAINT compra_detalle_pkey PRIMARY KEY (id);


--
-- Name: compra compra_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra
    ADD CONSTRAINT compra_pkey PRIMARY KEY (id);


--
-- Name: comprador comprador_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprador
    ADD CONSTRAINT comprador_pkey PRIMARY KEY (id);


--
-- Name: condicion_pago condicion_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.condicion_pago
    ADD CONSTRAINT condicion_pago_pkey PRIMARY KEY (id);


--
-- Name: config_feature_catalog config_feature_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_feature_catalog
    ADD CONSTRAINT config_feature_catalog_pkey PRIMARY KEY (feature_key);


--
-- Name: configuracion configuracion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_pkey PRIMARY KEY (id);


--
-- Name: control_licencia control_licencia_empresa_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_licencia
    ADD CONSTRAINT control_licencia_empresa_id_key UNIQUE (empresa_id);


--
-- Name: control_licencia control_licencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_licencia
    ADD CONSTRAINT control_licencia_pkey PRIMARY KEY (id);


--
-- Name: cotizacion cotizacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizacion
    ADD CONSTRAINT cotizacion_pkey PRIMARY KEY (id);


--
-- Name: empresa empresa_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT empresa_codigo_key UNIQUE (codigo);


--
-- Name: empresa_feature_config empresa_feature_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_feature_config
    ADD CONSTRAINT empresa_feature_config_pkey PRIMARY KEY (id);


--
-- Name: empresa empresa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT empresa_pkey PRIMARY KEY (id);


--
-- Name: factura factura_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura
    ADD CONSTRAINT factura_pkey PRIMARY KEY (id);


--
-- Name: factura_venta factura_venta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_venta
    ADD CONSTRAINT factura_venta_pkey PRIMARY KEY (factura_id, venta_id);


--
-- Name: ia_user_memory ia_user_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_user_memory
    ADD CONSTRAINT ia_user_memory_pkey PRIMARY KEY (user_id);


--
-- Name: ia_user_query_history ia_user_query_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_user_query_history
    ADD CONSTRAINT ia_user_query_history_pkey PRIMARY KEY (id);


--
-- Name: menu_digital_categoria menu_digital_categoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_categoria
    ADD CONSTRAINT menu_digital_categoria_pkey PRIMARY KEY (id);


--
-- Name: menu_digital_config menu_digital_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_config
    ADD CONSTRAINT menu_digital_config_pkey PRIMARY KEY (id);


--
-- Name: menu_digital_config menu_digital_config_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_config
    ADD CONSTRAINT menu_digital_config_slug_key UNIQUE (slug);


--
-- Name: menu_digital_item menu_digital_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_item
    ADD CONSTRAINT menu_digital_item_pkey PRIMARY KEY (id);


--
-- Name: mesa mesa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa
    ADD CONSTRAINT mesa_pkey PRIMARY KEY (id);


--
-- Name: moneda moneda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moneda
    ADD CONSTRAINT moneda_pkey PRIMARY KEY (id);


--
-- Name: producto producto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto
    ADD CONSTRAINT producto_pkey PRIMARY KEY (id);


--
-- Name: producto_precio_cantidad producto_precio_cantidad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_precio_cantidad
    ADD CONSTRAINT producto_precio_cantidad_pkey PRIMARY KEY (id);


--
-- Name: producto_precio_cantidad producto_precio_cantidad_producto_id_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_precio_cantidad
    ADD CONSTRAINT producto_precio_cantidad_producto_id_orden_key UNIQUE (producto_id, orden);


--
-- Name: producto_precio producto_precio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_precio
    ADD CONSTRAINT producto_precio_pkey PRIMARY KEY (id);


--
-- Name: programas programas_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programas
    ADD CONSTRAINT programas_codigo_key UNIQUE (codigo);


--
-- Name: programas programas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programas
    ADD CONSTRAINT programas_pkey PRIMARY KEY (id);


--
-- Name: proveedor proveedor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedor
    ADD CONSTRAINT proveedor_pkey PRIMARY KEY (id);


--
-- Name: stock_lote stock_lote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lote
    ADD CONSTRAINT stock_lote_pkey PRIMARY KEY (id);


--
-- Name: stock_movimiento stock_movimiento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movimiento
    ADD CONSTRAINT stock_movimiento_pkey PRIMARY KEY (id);


--
-- Name: terminal_feature_config terminal_feature_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminal_feature_config
    ADD CONSTRAINT terminal_feature_config_pkey PRIMARY KEY (id);


--
-- Name: terminal terminal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminal
    ADD CONSTRAINT terminal_pkey PRIMARY KEY (id);


--
-- Name: tipo_operacion tipo_operacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipo_operacion
    ADD CONSTRAINT tipo_operacion_pkey PRIMARY KEY (id);


--
-- Name: tipo_pedido tipo_pedido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipo_pedido
    ADD CONSTRAINT tipo_pedido_pkey PRIMARY KEY (id_tipo_pedido);


--
-- Name: empresa_feature_config uq_empresa_feature_config; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_feature_config
    ADD CONSTRAINT uq_empresa_feature_config UNIQUE (empresa_id, feature_key);


--
-- Name: terminal_feature_config uq_terminal_feature_config; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminal_feature_config
    ADD CONSTRAINT uq_terminal_feature_config UNIQUE (terminal_id, feature_key);


--
-- Name: usuario_permiso_accion uq_usuario_permiso_accion; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_permiso_accion
    ADD CONSTRAINT uq_usuario_permiso_accion UNIQUE (usuario_id, permiso);


--
-- Name: usuario_permiso_accion usuario_permiso_accion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_permiso_accion
    ADD CONSTRAINT usuario_permiso_accion_pkey PRIMARY KEY (id);


--
-- Name: usuario usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_pkey PRIMARY KEY (id);


--
-- Name: usuario_programa usuario_programa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_programa
    ADD CONSTRAINT usuario_programa_pkey PRIMARY KEY (id);


--
-- Name: usuario usuario_usuario_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_usuario_key UNIQUE (usuario);


--
-- Name: vendedor vendedor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedor
    ADD CONSTRAINT vendedor_pkey PRIMARY KEY (id);


--
-- Name: venta_cocina_envio venta_cocina_envio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_cocina_envio
    ADD CONSTRAINT venta_cocina_envio_pkey PRIMARY KEY (id);


--
-- Name: venta_cocina_envio venta_cocina_envio_request_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_cocina_envio
    ADD CONSTRAINT venta_cocina_envio_request_uuid_key UNIQUE (request_uuid);


--
-- Name: venta_detalle venta_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_detalle
    ADD CONSTRAINT venta_detalle_pkey PRIMARY KEY (id);


--
-- Name: venta venta_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta
    ADD CONSTRAINT venta_numero_key UNIQUE (numero);


--
-- Name: venta venta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta
    ADD CONSTRAINT venta_pkey PRIMARY KEY (id);


--
-- Name: idx_auditoria_registro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_registro ON public.auditoria USING btree (tabla, registro_id);


--
-- Name: idx_auditoria_tabla_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_tabla_fecha ON public.auditoria USING btree (tabla, fecha DESC);


--
-- Name: idx_auditoria_usuario_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_usuario_fecha ON public.auditoria USING btree (usuario_id, fecha DESC);


--
-- Name: idx_caja_arqueo_caja_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_arqueo_caja_fecha ON public.caja_arqueo USING btree (caja_id, created_at DESC);


--
-- Name: idx_caja_historial_caja_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_historial_caja_fecha ON public.caja_historial USING btree (caja_id, fecha DESC);


--
-- Name: idx_caja_historial_empresa_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_historial_empresa_fecha ON public.caja_historial USING btree (empresa_id, fecha DESC);


--
-- Name: idx_caja_historial_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_historial_fecha ON public.caja_historial USING btree (fecha DESC, id DESC);


--
-- Name: idx_caja_historial_origen_operacion_moneda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_historial_origen_operacion_moneda ON public.caja_historial USING btree (origen, operacion, moneda);


--
-- Name: idx_caja_historial_terminal_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_historial_terminal_fecha ON public.caja_historial USING btree (terminal_id, fecha DESC);


--
-- Name: idx_caja_historial_usuario_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_historial_usuario_fecha ON public.caja_historial USING btree (usuario_id, fecha DESC);


--
-- Name: idx_caja_mov_manual_caja_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_mov_manual_caja_fecha ON public.caja_movimiento_manual USING btree (caja_id, created_at DESC);


--
-- Name: idx_caja_mov_manual_terminal_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_mov_manual_terminal_fecha ON public.caja_movimiento_manual USING btree (terminal_id, created_at DESC);


--
-- Name: idx_caja_movimiento_sesion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_movimiento_sesion ON public.caja_movimiento USING btree (caja_sesion_id);


--
-- Name: idx_caja_movimiento_usuario_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_movimiento_usuario_fecha ON public.caja_movimiento USING btree (usuario_id, fecha DESC);


--
-- Name: idx_caja_sesiones_terminal_estado_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_sesiones_terminal_estado_fecha ON public.caja_sesiones USING btree (terminal_id, estado, fecha_apertura DESC);


--
-- Name: idx_caja_terminal_estado_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caja_terminal_estado_fecha ON public.caja USING btree (terminal_id, estado, fecha_apertura DESC);


--
-- Name: idx_categoria_mostrar_menu_digital; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categoria_mostrar_menu_digital ON public.categoria USING btree (mostrar_menu_digital, id);


--
-- Name: idx_cfg_feature_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cfg_feature_scope ON public.config_feature_catalog USING btree (scope, sort_order, feature_key);


--
-- Name: idx_cliente_numero_documento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cliente_numero_documento ON public.cliente USING btree (numero_documento);


--
-- Name: idx_compra_detalle_compra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compra_detalle_compra ON public.compra_detalle USING btree (compra_id);


--
-- Name: idx_compra_detalle_compra_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compra_detalle_compra_producto ON public.compra_detalle USING btree (compra_id, producto_id);


--
-- Name: idx_compra_detalle_moneda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compra_detalle_moneda ON public.compra_detalle USING btree (moneda_id);


--
-- Name: idx_compra_detalle_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compra_detalle_producto ON public.compra_detalle USING btree (producto_id);


--
-- Name: idx_compra_tipo_operacion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compra_tipo_operacion_id ON public.compra USING btree (tipo_operacion_id);


--
-- Name: idx_comprador_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comprador_activo ON public.comprador USING btree (activo);


--
-- Name: idx_empresa_feature_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empresa_feature_empresa ON public.empresa_feature_config USING btree (empresa_id);


--
-- Name: idx_empresa_feature_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empresa_feature_key ON public.empresa_feature_config USING btree (feature_key);


--
-- Name: idx_factura_venta_venta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factura_venta_venta ON public.factura_venta USING btree (venta_id);


--
-- Name: idx_ia_user_query_history_modulo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ia_user_query_history_modulo ON public.ia_user_query_history USING btree (modulo_aplicado, created_at DESC);


--
-- Name: idx_ia_user_query_history_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ia_user_query_history_user_created ON public.ia_user_query_history USING btree (user_id, created_at DESC, id DESC);


--
-- Name: idx_menu_digital_categoria_menu_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_digital_categoria_menu_orden ON public.menu_digital_categoria USING btree (menu_id, orden, id);


--
-- Name: idx_menu_digital_item_menu_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_digital_item_menu_orden ON public.menu_digital_item USING btree (menu_id, orden, id);


--
-- Name: idx_mesa_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesa_scope ON public.mesa USING btree (empresa_id, terminal_id);


--
-- Name: idx_mesa_scope_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesa_scope_estado ON public.mesa USING btree (empresa_id, terminal_id, estado);


--
-- Name: idx_mesa_scope_venta_rapida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesa_scope_venta_rapida ON public.mesa USING btree (empresa_id, terminal_id, mostrar_en_venta_rapida);


--
-- Name: idx_producto_es_servicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_producto_es_servicio ON public.producto USING btree (es_servicio);


--
-- Name: idx_producto_mostrar_menu_digital; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_producto_mostrar_menu_digital ON public.producto USING btree (mostrar_menu_digital, categoria_id, id);


--
-- Name: idx_producto_precio_cantidad_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_producto_precio_cantidad_producto ON public.producto_precio_cantidad USING btree (producto_id);


--
-- Name: idx_producto_precio_moneda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_producto_precio_moneda ON public.producto_precio USING btree (precio_compra_moneda_id);


--
-- Name: idx_proveedor_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proveedor_activo ON public.proveedor USING btree (activo);


--
-- Name: idx_stock_lote_empresa_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_lote_empresa_producto ON public.stock_lote USING btree (empresa_id, producto_id);


--
-- Name: idx_stock_lote_producto_vencimiento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_lote_producto_vencimiento ON public.stock_lote USING btree (producto_id, fecha_vencimiento);


--
-- Name: idx_stock_lote_unique_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_stock_lote_unique_key ON public.stock_lote USING btree (empresa_id, producto_id, COALESCE(lote, ''::character varying), COALESCE(fecha_vencimiento, '1900-01-01'::date));


--
-- Name: idx_terminal_feature_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_terminal_feature_key ON public.terminal_feature_config USING btree (feature_key);


--
-- Name: idx_terminal_feature_terminal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_terminal_feature_terminal ON public.terminal_feature_config USING btree (terminal_id);


--
-- Name: idx_terminal_tipo_pedido_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_terminal_tipo_pedido_default ON public.terminal USING btree (tipo_pedido_default_id);


--
-- Name: idx_usuario_permiso_permiso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuario_permiso_permiso ON public.usuario_permiso_accion USING btree (permiso);


--
-- Name: idx_usuario_permiso_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuario_permiso_usuario ON public.usuario_permiso_accion USING btree (usuario_id);


--
-- Name: idx_usuario_programa_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuario_programa_usuario ON public.usuario_programa USING btree (usuario_id);


--
-- Name: idx_venta_cocina_envio_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venta_cocina_envio_estado ON public.venta_cocina_envio USING btree (estado, updated_at DESC);


--
-- Name: idx_venta_cocina_envio_venta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venta_cocina_envio_venta ON public.venta_cocina_envio USING btree (venta_id, created_at DESC);


--
-- Name: idx_venta_comision_vendedor_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venta_comision_vendedor_estado ON public.venta USING btree (vendedor_id, estado, fecha);


--
-- Name: idx_venta_detalle_moneda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venta_detalle_moneda ON public.venta_detalle USING btree (precio_moneda_id);


--
-- Name: idx_venta_tipo_operacion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venta_tipo_operacion_id ON public.venta USING btree (tipo_operacion_id);


--
-- Name: uq_caja_movimiento_tipo_nombre_naturaleza; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_caja_movimiento_tipo_nombre_naturaleza ON public.caja_movimiento_tipo USING btree (nombre, naturaleza);


--
-- Name: uq_caja_terminal_abierta; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_caja_terminal_abierta ON public.caja USING btree (terminal_id) WHERE ((terminal_id IS NOT NULL) AND (upper((estado)::text) = 'ABIERTA'::text));


--
-- Name: uq_menu_digital_categoria_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_menu_digital_categoria_origen ON public.menu_digital_categoria USING btree (menu_id, origen_categoria_id) WHERE (origen_categoria_id IS NOT NULL);


--
-- Name: uq_menu_digital_config_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_menu_digital_config_scope ON public.menu_digital_config USING btree (empresa_id, terminal_id);


--
-- Name: uq_menu_digital_item_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_menu_digital_item_origen ON public.menu_digital_item USING btree (menu_id, origen_producto_id) WHERE (origen_producto_id IS NOT NULL);


--
-- Name: uq_mesa_numero_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mesa_numero_scope ON public.mesa USING btree (empresa_id, terminal_id, numero);


--
-- Name: uq_mesa_venta_activa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mesa_venta_activa ON public.mesa USING btree (venta_id) WHERE (venta_id IS NOT NULL);


--
-- Name: uq_usuario_programa_usuario_programa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_usuario_programa_usuario_programa ON public.usuario_programa USING btree (usuario_id, programa_id) WHERE (programa_id IS NOT NULL);


--
-- Name: uq_usuario_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_usuario_usuario ON public.usuario USING btree (upper((usuario)::text));


--
-- Name: caja trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.caja FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: caja_arqueo trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.caja_arqueo FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: caja_historial trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.caja_historial FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: caja_movimiento trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.caja_movimiento FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: caja_movimiento_manual trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.caja_movimiento_manual FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: caja_movimiento_tipo trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.caja_movimiento_tipo FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: caja_pago_detalle trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.caja_pago_detalle FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: caja_sesiones trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.caja_sesiones FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: categoria trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.categoria FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: cliente trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.cliente FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: compra trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.compra FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: compra_detalle trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.compra_detalle FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: comprador trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.comprador FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: condicion_pago trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.condicion_pago FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: config_feature_catalog trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.config_feature_catalog FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: configuracion trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.configuracion FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: control_licencia trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.control_licencia FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: cotizacion trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.cotizacion FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: empresa trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.empresa FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: empresa_feature_config trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.empresa_feature_config FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: factura trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.factura FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: factura_venta trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.factura_venta FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: ia_user_memory trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.ia_user_memory FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: ia_user_query_history trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.ia_user_query_history FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: menu_digital_categoria trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.menu_digital_categoria FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: menu_digital_config trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.menu_digital_config FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: menu_digital_item trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.menu_digital_item FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: mesa trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.mesa FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: moneda trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.moneda FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: producto trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.producto FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: producto_precio trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.producto_precio FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: producto_precio_cantidad trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.producto_precio_cantidad FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: programas trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.programas FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: proveedor trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.proveedor FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: stock_lote trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.stock_lote FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: stock_movimiento trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.stock_movimiento FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: terminal trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.terminal FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: terminal_feature_config trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.terminal_feature_config FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: tipo_operacion trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.tipo_operacion FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: tipo_pedido trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.tipo_pedido FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: usuario trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.usuario FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: usuario_permiso_accion trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.usuario_permiso_accion FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: usuario_programa trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.usuario_programa FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: vendedor trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.vendedor FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: venta trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.venta FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: venta_cocina_envio trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.venta_cocina_envio FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: venta_detalle trg_auditoria_dml; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_dml AFTER INSERT OR DELETE OR UPDATE ON public.venta_detalle FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_dml();


--
-- Name: caja_arqueo caja_arqueo_caja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_arqueo
    ADD CONSTRAINT caja_arqueo_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES public.caja(id) ON DELETE CASCADE;


--
-- Name: caja_arqueo caja_arqueo_caja_sesion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_arqueo
    ADD CONSTRAINT caja_arqueo_caja_sesion_id_fkey FOREIGN KEY (caja_sesion_id) REFERENCES public.caja_sesiones(id) ON DELETE SET NULL;


--
-- Name: caja_arqueo caja_arqueo_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_arqueo
    ADD CONSTRAINT caja_arqueo_terminal_id_fkey FOREIGN KEY (terminal_id) REFERENCES public.terminal(id) ON DELETE SET NULL;


--
-- Name: caja_arqueo caja_arqueo_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_arqueo
    ADD CONSTRAINT caja_arqueo_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON DELETE SET NULL;


--
-- Name: caja caja_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja
    ADD CONSTRAINT caja_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: caja_movimiento caja_movimiento_caja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento
    ADD CONSTRAINT caja_movimiento_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES public.caja(id) ON DELETE CASCADE;


--
-- Name: caja_movimiento caja_movimiento_caja_sesion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento
    ADD CONSTRAINT caja_movimiento_caja_sesion_id_fkey FOREIGN KEY (caja_sesion_id) REFERENCES public.caja_sesiones(id) ON DELETE SET NULL;


--
-- Name: caja_movimiento_manual caja_movimiento_manual_caja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento_manual
    ADD CONSTRAINT caja_movimiento_manual_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES public.caja(id) ON DELETE CASCADE;


--
-- Name: caja_movimiento_manual caja_movimiento_manual_caja_sesion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento_manual
    ADD CONSTRAINT caja_movimiento_manual_caja_sesion_id_fkey FOREIGN KEY (caja_sesion_id) REFERENCES public.caja_sesiones(id) ON DELETE SET NULL;


--
-- Name: caja_movimiento_manual caja_movimiento_manual_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento_manual
    ADD CONSTRAINT caja_movimiento_manual_terminal_id_fkey FOREIGN KEY (terminal_id) REFERENCES public.terminal(id) ON DELETE SET NULL;


--
-- Name: caja_movimiento_manual caja_movimiento_manual_tipo_movimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento_manual
    ADD CONSTRAINT caja_movimiento_manual_tipo_movimiento_id_fkey FOREIGN KEY (tipo_movimiento_id) REFERENCES public.caja_movimiento_tipo(id) ON DELETE SET NULL;


--
-- Name: caja_movimiento_manual caja_movimiento_manual_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento_manual
    ADD CONSTRAINT caja_movimiento_manual_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON DELETE SET NULL;


--
-- Name: caja_movimiento caja_movimiento_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento
    ADD CONSTRAINT caja_movimiento_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON DELETE SET NULL;


--
-- Name: caja_movimiento caja_movimiento_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento
    ADD CONSTRAINT caja_movimiento_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.venta(id) ON DELETE SET NULL;


--
-- Name: caja_pago_detalle caja_pago_detalle_caja_movimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_pago_detalle
    ADD CONSTRAINT caja_pago_detalle_caja_movimiento_id_fkey FOREIGN KEY (caja_movimiento_id) REFERENCES public.caja_movimiento(id) ON DELETE CASCADE;


--
-- Name: caja_sesiones caja_sesiones_caja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_sesiones
    ADD CONSTRAINT caja_sesiones_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES public.caja(id) ON DELETE CASCADE;


--
-- Name: caja_sesiones caja_sesiones_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_sesiones
    ADD CONSTRAINT caja_sesiones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON DELETE SET NULL;


--
-- Name: caja caja_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja
    ADD CONSTRAINT caja_terminal_id_fkey FOREIGN KEY (terminal_id) REFERENCES public.terminal(id) ON DELETE CASCADE;


--
-- Name: control_licencia control_licencia_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_licencia
    ADD CONSTRAINT control_licencia_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: empresa_feature_config empresa_feature_config_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_feature_config
    ADD CONSTRAINT empresa_feature_config_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: empresa_feature_config empresa_feature_config_feature_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_feature_config
    ADD CONSTRAINT empresa_feature_config_feature_key_fkey FOREIGN KEY (feature_key) REFERENCES public.config_feature_catalog(feature_key) ON DELETE CASCADE;


--
-- Name: factura factura_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura
    ADD CONSTRAINT factura_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.venta(id);


--
-- Name: caja_movimiento fk_caja_movimiento_sesion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento
    ADD CONSTRAINT fk_caja_movimiento_sesion FOREIGN KEY (caja_sesion_id) REFERENCES public.caja_sesiones(id) ON DELETE SET NULL;


--
-- Name: caja_movimiento fk_caja_movimiento_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_movimiento
    ADD CONSTRAINT fk_caja_movimiento_usuario FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON DELETE SET NULL;


--
-- Name: caja_sesiones fk_caja_sesiones_terminal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_sesiones
    ADD CONSTRAINT fk_caja_sesiones_terminal FOREIGN KEY (terminal_id) REFERENCES public.terminal(id) ON DELETE SET NULL;


--
-- Name: caja_sesiones fk_caja_sesiones_usuario_cierre; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja_sesiones
    ADD CONSTRAINT fk_caja_sesiones_usuario_cierre FOREIGN KEY (usuario_cierre) REFERENCES public.usuario(id) ON DELETE SET NULL;


--
-- Name: caja fk_caja_terminal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caja
    ADD CONSTRAINT fk_caja_terminal FOREIGN KEY (terminal_id) REFERENCES public.terminal(id) ON DELETE SET NULL;


--
-- Name: compra_detalle fk_compra_detalle_compra; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_detalle
    ADD CONSTRAINT fk_compra_detalle_compra FOREIGN KEY (compra_id) REFERENCES public.compra(id) ON DELETE CASCADE;


--
-- Name: compra_detalle fk_compra_detalle_cotizacion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_detalle
    ADD CONSTRAINT fk_compra_detalle_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES public.cotizacion(id);


--
-- Name: compra_detalle fk_compra_detalle_moneda; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_detalle
    ADD CONSTRAINT fk_compra_detalle_moneda FOREIGN KEY (moneda_id) REFERENCES public.moneda(id);


--
-- Name: compra_detalle fk_compra_detalle_producto; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_detalle
    ADD CONSTRAINT fk_compra_detalle_producto FOREIGN KEY (producto_id) REFERENCES public.producto(id) ON DELETE RESTRICT;


--
-- Name: compra fk_compra_tipo_operacion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra
    ADD CONSTRAINT fk_compra_tipo_operacion FOREIGN KEY (tipo_operacion_id) REFERENCES public.tipo_operacion(id);


--
-- Name: factura_venta fk_factura_venta_factura; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_venta
    ADD CONSTRAINT fk_factura_venta_factura FOREIGN KEY (factura_id) REFERENCES public.factura(id) ON DELETE CASCADE;


--
-- Name: factura_venta fk_factura_venta_venta; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factura_venta
    ADD CONSTRAINT fk_factura_venta_venta FOREIGN KEY (venta_id) REFERENCES public.venta(id) ON DELETE CASCADE;


--
-- Name: mesa fk_mesa_venta; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa
    ADD CONSTRAINT fk_mesa_venta FOREIGN KEY (venta_id) REFERENCES public.venta(id) ON DELETE SET NULL;


--
-- Name: producto_precio fk_producto_precio_cotizacion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_precio
    ADD CONSTRAINT fk_producto_precio_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES public.cotizacion(id);


--
-- Name: producto_precio fk_producto_precio_moneda; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_precio
    ADD CONSTRAINT fk_producto_precio_moneda FOREIGN KEY (precio_compra_moneda_id) REFERENCES public.moneda(id);


--
-- Name: venta_detalle fk_venta_detalle_cotizacion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_detalle
    ADD CONSTRAINT fk_venta_detalle_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES public.cotizacion(id);


--
-- Name: venta_detalle fk_venta_detalle_moneda; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_detalle
    ADD CONSTRAINT fk_venta_detalle_moneda FOREIGN KEY (precio_moneda_id) REFERENCES public.moneda(id);


--
-- Name: venta fk_venta_tipo_operacion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta
    ADD CONSTRAINT fk_venta_tipo_operacion FOREIGN KEY (tipo_operacion_id) REFERENCES public.tipo_operacion(id);


--
-- Name: menu_digital_categoria menu_digital_categoria_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_categoria
    ADD CONSTRAINT menu_digital_categoria_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menu_digital_config(id) ON DELETE CASCADE;


--
-- Name: menu_digital_categoria menu_digital_categoria_origen_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_categoria
    ADD CONSTRAINT menu_digital_categoria_origen_categoria_id_fkey FOREIGN KEY (origen_categoria_id) REFERENCES public.categoria(id) ON DELETE SET NULL;


--
-- Name: menu_digital_config menu_digital_config_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_config
    ADD CONSTRAINT menu_digital_config_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: menu_digital_config menu_digital_config_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_config
    ADD CONSTRAINT menu_digital_config_terminal_id_fkey FOREIGN KEY (terminal_id) REFERENCES public.terminal(id) ON DELETE CASCADE;


--
-- Name: menu_digital_item menu_digital_item_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_item
    ADD CONSTRAINT menu_digital_item_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.menu_digital_categoria(id) ON DELETE SET NULL;


--
-- Name: menu_digital_item menu_digital_item_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_item
    ADD CONSTRAINT menu_digital_item_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menu_digital_config(id) ON DELETE CASCADE;


--
-- Name: menu_digital_item menu_digital_item_origen_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_item
    ADD CONSTRAINT menu_digital_item_origen_categoria_id_fkey FOREIGN KEY (origen_categoria_id) REFERENCES public.categoria(id) ON DELETE SET NULL;


--
-- Name: menu_digital_item menu_digital_item_origen_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_digital_item
    ADD CONSTRAINT menu_digital_item_origen_producto_id_fkey FOREIGN KEY (origen_producto_id) REFERENCES public.producto(id) ON DELETE SET NULL;


--
-- Name: producto producto_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto
    ADD CONSTRAINT producto_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categoria(id) ON DELETE SET NULL;


--
-- Name: producto_precio_cantidad producto_precio_cantidad_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_precio_cantidad
    ADD CONSTRAINT producto_precio_cantidad_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.producto(id) ON DELETE CASCADE;


--
-- Name: producto_precio producto_precio_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.producto_precio
    ADD CONSTRAINT producto_precio_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.producto(id) ON DELETE CASCADE;


--
-- Name: stock_lote stock_lote_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lote
    ADD CONSTRAINT stock_lote_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id);


--
-- Name: stock_lote stock_lote_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lote
    ADD CONSTRAINT stock_lote_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.producto(id);


--
-- Name: stock_movimiento stock_movimiento_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movimiento
    ADD CONSTRAINT stock_movimiento_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id);


--
-- Name: stock_movimiento stock_movimiento_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movimiento
    ADD CONSTRAINT stock_movimiento_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.producto(id);


--
-- Name: terminal terminal_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminal
    ADD CONSTRAINT terminal_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: terminal_feature_config terminal_feature_config_feature_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminal_feature_config
    ADD CONSTRAINT terminal_feature_config_feature_key_fkey FOREIGN KEY (feature_key) REFERENCES public.config_feature_catalog(feature_key) ON DELETE CASCADE;


--
-- Name: terminal_feature_config terminal_feature_config_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminal_feature_config
    ADD CONSTRAINT terminal_feature_config_terminal_id_fkey FOREIGN KEY (terminal_id) REFERENCES public.terminal(id) ON DELETE CASCADE;


--
-- Name: usuario usuario_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE SET NULL;


--
-- Name: usuario_permiso_accion usuario_permiso_accion_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_permiso_accion
    ADD CONSTRAINT usuario_permiso_accion_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON DELETE CASCADE;


--
-- Name: usuario_programa usuario_programa_programa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_programa
    ADD CONSTRAINT usuario_programa_programa_id_fkey FOREIGN KEY (programa_id) REFERENCES public.programas(id) ON DELETE CASCADE;


--
-- Name: usuario_programa usuario_programa_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_programa
    ADD CONSTRAINT usuario_programa_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON DELETE CASCADE;


--
-- Name: venta venta_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta
    ADD CONSTRAINT venta_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.cliente(id) ON DELETE SET NULL;


--
-- Name: venta_cocina_envio venta_cocina_envio_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_cocina_envio
    ADD CONSTRAINT venta_cocina_envio_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.venta(id) ON DELETE CASCADE;


--
-- Name: venta_detalle venta_detalle_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_detalle
    ADD CONSTRAINT venta_detalle_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.producto(id) ON DELETE RESTRICT;


--
-- Name: venta_detalle venta_detalle_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_detalle
    ADD CONSTRAINT venta_detalle_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.venta(id) ON DELETE CASCADE;


--
-- Name: venta venta_en_espera_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta
    ADD CONSTRAINT venta_en_espera_por_usuario_id_fkey FOREIGN KEY (en_espera_por_usuario_id) REFERENCES public.usuario(id) ON DELETE SET NULL;


--
-- Name: venta venta_tipo_operacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta
    ADD CONSTRAINT venta_tipo_operacion_id_fkey FOREIGN KEY (tipo_operacion_id) REFERENCES public.tipo_operacion(id) ON DELETE SET NULL;


--
-- Name: venta venta_tipo_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta
    ADD CONSTRAINT venta_tipo_pedido_id_fkey FOREIGN KEY (tipo_pedido_id) REFERENCES public.tipo_pedido(id_tipo_pedido) ON DELETE SET NULL;


--
-- Name: venta venta_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta
    ADD CONSTRAINT venta_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.vendedor(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict FFjZWo2m6jTDOopeZUtbHbwvrbVoJz5d5TUYMuWQLokcIVBnItzB9UmzMqIQHLO

