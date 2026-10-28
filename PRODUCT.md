# CareLedger

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Doctors manage appointments, medical records, and care tasks. Patients manage their own records, appointments, tasks, and doctor access.

## Product Purpose

An operational healthcare application with an independently verifiable blockchain audit trail.

## Capabilities and Constraints

Role-separated authenticated workspaces; encrypted medical data; append-only records and task events; patient-controlled access; interactive live EVM visualization. Only opaque commitments belong on-chain. Clinical deployment requires separate infrastructure, compliance assessment, and security validation.

## Brand Commitments

The user explicitly chose a bright, minimal hospital workspace.

## Stack

Implementation assumption: React, Express, Node 24 SQLite, Solidity, ethers, and a persistent local EVM for evaluation. External JSON-RPC network supported for deployment. No framework or external network was specified.

## Evidence on Hand

No real patient information or hospital credentials were supplied. Seeded evaluation data is synthetic and opt-in.

## Product Principles

Patient consent determines access. Pending verification stays visible. Corrections append history. Network statistics reflect observed chain data.
